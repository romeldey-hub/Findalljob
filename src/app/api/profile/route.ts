import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser, isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // Base query — guaranteed columns from migration 001
  const { data: base } = await adminClient
    .from('profiles')
    .select('subscription_status')
    .eq('user_id', user.id)
    .single()

  // Optional columns from later migrations — null-safe if columns don't exist yet
  const { data: ext } = await adminClient
    .from('profiles')
    .select('role, has_used_free_preview')
    .eq('user_id', user.id)
    .single()

  // Usage tracking columns from migrations 016 + 017 + 020 + 021
  const { data: usage } = await adminClient
    .from('profiles')
    .select('resume_upload_count, ai_reanalyze_count, job_search_count, ai_assist_daily_count, ai_assist_date, optimize_free_daily_count, optimize_free_date')
    .eq('user_id', user.id)
    .single()

  // Billing lifecycle columns from migration 012
  const { data: billing } = await adminClient
    .from('profiles')
    .select('pro_until, cancel_at_period_end')
    .eq('user_id', user.id)
    .single()

  // Plan tier column from migration 023
  const { data: planTierRow } = await adminClient
    .from('profiles')
    .select('plan_tier')
    .eq('user_id', user.id)
    .single()

  const isAdmin = isAdminUser(user.email, ext?.role)

  // Backfill legacy Pro users (subscription_status='pro', pro_until=null) and return effective value
  const effectiveProUntil = await resolveProUntil(
    adminClient, user.id, base?.subscription_status, billing?.pro_until
  )

  // Lazy expiry: sync subscription_status for data consistency
  if (effectiveProUntil && new Date(effectiveProUntil) <= new Date() && base?.subscription_status === 'pro') {
    void adminClient
      .from('profiles')
      .update({ subscription_status: 'free' })
      .eq('user_id', user.id)
  }

  const isPro = isProUser(user.email, ext?.role, base?.subscription_status, effectiveProUntil)

  // AI credits — null-safe if migration not yet applied or row not yet created
  const { data: creditsRow } = await adminClient
    .from('ai_credits')
    .select('remaining_credits, total_credits, reset_date')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    plan: isPro ? 'pro' : 'free',
    has_used_free_preview: isAdmin ? false : (ext?.has_used_free_preview ?? false),
    subscription_status: base?.subscription_status ?? 'free',
    pro_until: effectiveProUntil,
    cancel_at_period_end: billing?.cancel_at_period_end ?? false,
    resume_upload_count:        usage?.resume_upload_count        ?? 0,
    ai_reanalyze_count:         usage?.ai_reanalyze_count         ?? 0,
    job_search_count:           usage?.job_search_count           ?? 0,
    ai_assist_daily_count:      usage?.ai_assist_daily_count      ?? 0,
    ai_assist_date:             usage?.ai_assist_date             ?? '',
    optimize_free_daily_count:  usage?.optimize_free_daily_count  ?? 0,
    optimize_free_date:         usage?.optimize_free_date         ?? '',
    credits_remaining: creditsRow != null ? Number(creditsRow.remaining_credits) : null,
    credits_total:     creditsRow != null ? Number(creditsRow.total_credits)     : null,
    credits_reset_date: creditsRow?.reset_date ?? null,
    plan_tier: planTierRow?.plan_tier ?? 'free',
  })
}
