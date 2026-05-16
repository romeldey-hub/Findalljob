import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateLight } from '@/lib/ai/client'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { FREE_LIMITS, PRO_LIMITS } from '@/lib/limits'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'

const PROMPTS: Record<string, (text: string, context?: string) => string> = {
  improve: (text) =>
    `Rewrite this resume text to be more impactful, professional, and ATS-friendly. Keep roughly the same length. Return only the improved text with no explanation or quotes:\n\n${text}`,

  shorten: (text) =>
    `Make this resume text more concise while preserving all key information. Aim for 20–30% shorter. Return only the shortened text with no explanation or quotes:\n\n${text}`,

  strengthen: (text) =>
    `Rewrite this resume text using stronger action verbs and adding quantified results where possible (use realistic estimates if needed). Return only the improved text with no explanation or quotes:\n\n${text}`,

  add_bullet: (_text, context) =>
    `Write one new strong bullet point for a resume that fits with these existing bullets. Use an action verb, be specific, and keep it to one sentence. Return only the bullet text with no dash, bullet symbol, or explanation:\n\nExisting bullets:\n${context || _text}`,
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Resolve plan and daily limit
  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until, plan_tier, ai_assist_daily_count, ai_assist_date')
    .eq('user_id', user.id)
    .single()
  const effectiveProUntil = await resolveProUntil(
    admin, user.id, profileRow?.subscription_status, profileRow?.pro_until
  )
  const isPro    = isProUser(user.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
  const planTier = (profileRow?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')
  const dailyLimit = isPro ? PRO_LIMITS.aiAssistPerDay : FREE_LIMITS.aiAssistPerDay

  const today     = new Date().toISOString().slice(0, 10)
  const isToday   = profileRow?.ai_assist_date === today
  const usedToday = isToday ? (profileRow?.ai_assist_daily_count ?? 0) : 0

  if (usedToday >= dailyLimit) {
    return NextResponse.json(
      { error: `Daily AI assist limit reached (${dailyLimit}/day). Resets at midnight.${isPro ? '' : ' Upgrade to keep strengthening your resume.'}` },
      { status: 429 }
    )
  }

  // Credit check: each AI assist action costs 0.5 credits
  const { allowed: creditAllowed, balance: creditBalance, cost: creditCost } =
    await checkCredits(user.id, 'aiAssist', isPro, admin, planTier)
  if (!creditAllowed) {
    return NextResponse.json(
      insufficientCreditsResponse('aiAssist', creditBalance.remainingCredits),
      { status: 402 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { action, text, context } = body as { action: string; text: string; context?: string }

  if (!action || !text) return NextResponse.json({ error: 'action and text required' }, { status: 400 })

  const promptFn = PROMPTS[action]
  if (!promptFn) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  try {
    const result = await generateLight(promptFn(text, context), { task: `bullet_${action}`, maxTokens: 150, userId: user.id, isFreeUser: !isPro, creditsCharged: creditCost, creditFeatureKey: 'aiAssist' })

    // Deduct credits and increment daily counter (both fire-and-forget)
    const afterCredits = await deductCredits(user.id, 'aiAssist', admin)
    void admin
      .from('profiles')
      .update({ ai_assist_daily_count: usedToday + 1, ai_assist_date: today })
      .eq('user_id', user.id)

    return NextResponse.json({
      result:           result.trim(),
      creditCost:       creditCost,
      creditsUsed:      creditCost,
      creditsRemaining: afterCredits?.remainingCredits ?? 0,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI assist failed'
    console.error('[resume/ai-assist]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
