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

  // Billing lifecycle columns from migration 012
  const { data: billing } = await adminClient
    .from('profiles')
    .select('pro_until, cancel_at_period_end')
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

  return NextResponse.json({
    plan: isPro ? 'pro' : 'free',
    has_used_free_preview: isAdmin ? false : (ext?.has_used_free_preview ?? false),
    subscription_status: base?.subscription_status ?? 'free',
    pro_until: effectiveProUntil,
    cancel_at_period_end: billing?.cancel_at_period_end ?? false,
  })
}
