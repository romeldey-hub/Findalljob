import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateFollowUpMessage, type MessageType } from '@/lib/ai/followup'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import { checkRateLimit, userRateLimitKey, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // ── Plan resolution ────────────────────────────────────────────────────────
  const { data: proProfile } = await admin
    .from('profiles')
    .select('subscription_status, role, pro_until, plan_tier')
    .eq('user_id', user.id)
    .single()
  const effectiveProUntil = await resolveProUntil(
    admin, user.id, proProfile?.subscription_status, proProfile?.pro_until,
  )
  const isPro    = isProUser(user.email, proProfile?.role, proProfile?.subscription_status, effectiveProUntil)
  const planTier = (proProfile?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')

  // ── Pro gate ───────────────────────────────────────────────────────────────
  if (!isPro) {
    return NextResponse.json(
      { requiresUpgrade: true, error: 'Unlock Pro to generate AI follow-up messages that improve your response rate.' },
      { status: 402 },
    )
  }

  // ── Rate limit: 6 follow-ups / minute / user ───────────────────────────────
  const rlResult = await checkRateLimit(
    userRateLimitKey(user.id, 'quick_fix'),
    'quick_fix',
    admin,
  )
  if (!rlResult.allowed) {
    console.warn(`[followup/generate] rate-limited | user=${user.id}`)
    return NextResponse.json(rateLimitResponse(rlResult), { status: 429 })
  }

  // ── Credit check (0.5 credits: AI message generation) ─────────────────────
  const { allowed: creditAllowed, balance: creditBalance, cost: creditCost } =
    await checkCredits(user.id, 'aiAssist', isPro, admin, planTier)

  if (!creditAllowed) {
    console.warn(`[followup/generate] insufficient credits | user=${user.id} | remaining=${creditBalance.remainingCredits}`)
    return NextResponse.json(
      insufficientCreditsResponse('aiAssist', creditBalance.remainingCredits),
      { status: 402 },
    )
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const { applicationId, type = 'follow_up', recruiterName } = await request.json()
  if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 })

  const { data: application, error } = await supabase
    .from('applications')
    .select(`
      follow_up_messages,
      job:jobs (title, company, description)
    `)
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .single()

  if (error || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, summary')
    .eq('user_id', user.id)
    .single()

  const job = (Array.isArray(application.job) ? application.job[0] : application.job) as { title: string; company: string; description: string }

  // ── AI call ────────────────────────────────────────────────────────────────
  const message = await generateFollowUpMessage({
    type: type as MessageType,
    candidateName: profile?.full_name ?? 'the candidate',
    jobTitle: job.title,
    company: job.company,
    resumeSummary: profile?.summary ?? '',
    jobDescription: job.description,
    recruiterName,
  })

  // ── Save message to application record ────────────────────────────────────
  const existing = (application.follow_up_messages ?? []) as Array<{
    type: string; content: string; generated_at: string
  }>
  const updated = [
    ...existing,
    { type, content: message, generated_at: new Date().toISOString() },
  ]

  await supabase
    .from('applications')
    .update({ follow_up_messages: updated })
    .eq('id', applicationId)
    .eq('user_id', user.id)

  // ── Deduct credits after successful AI call + DB save ──────────────────────
  const afterCredits = await deductCredits(user.id, 'aiAssist', admin)

  return NextResponse.json({
    message,
    creditCost,
    creditsRemaining: afterCredits?.remainingCredits ?? creditBalance.remainingCredits - creditCost,
  })
}
