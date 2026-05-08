import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateLightJSON } from '@/lib/ai/client'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import { checkRateLimit, userRateLimitKey, rateLimitResponse } from '@/lib/rate-limit'

export const maxDuration = 30

interface EvaluationResult {
  scores: { clarity: number; relevance: number; depth: number; confidence: number }
  strengths: string[]
  gaps: string[]
  redFlags: string[]
  improvedAnswer: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // ── Plan resolution ────────────────────────────────────────────────────────
  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until, plan_tier')
    .eq('user_id', user.id)
    .single()

  const effectiveProUntil = await resolveProUntil(
    admin, user.id, profileRow?.subscription_status, profileRow?.pro_until,
  )
  const isPro     = isProUser(user.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
  const planTier  = (profileRow?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')

  // ── Rate limit: 10 evaluations / minute / user ─────────────────────────────
  const rlResult = await checkRateLimit(
    userRateLimitKey(user.id, 'interview_eval'),
    'interview_eval',
    admin,
  )
  if (!rlResult.allowed) {
    console.warn(`[interview/evaluate] rate-limited | user=${user.id}`)
    return NextResponse.json(rateLimitResponse(rlResult), { status: 429 })
  }

  // ── Credit check (0.5 credits per evaluation) ──────────────────────────────
  const { allowed: creditAllowed, balance: creditBalance, cost: creditCost } =
    await checkCredits(user.id, 'interviewEval', isPro, admin, planTier)

  if (!creditAllowed) {
    console.warn(`[interview/evaluate] insufficient credits | user=${user.id} | remaining=${creditBalance.remainingCredits}`)
    return NextResponse.json(
      insufficientCreditsResponse('interviewEval', creditBalance.remainingCredits),
      { status: 402 },
    )
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const { question, answer, jobTitle, company } = await req.json()
  if (!question || !answer) {
    return NextResponse.json({ error: 'question and answer are required' }, { status: 400 })
  }
  if (answer.trim().length < 5) {
    return NextResponse.json({ error: 'Answer is too short to evaluate' }, { status: 400 })
  }

  // ── AI call ────────────────────────────────────────────────────────────────
  const result = await generateLightJSON<EvaluationResult>(
    `Evaluate this interview answer for the ${jobTitle} position at ${company}.

QUESTION: ${question}

CANDIDATE'S ANSWER: ${answer.slice(0, 2000)}

Return a JSON object with EXACTLY this shape:
{
  "scores": {
    "clarity": <integer 1-10>,
    "relevance": <integer 1-10>,
    "depth": <integer 1-10>,
    "confidence": <integer 1-10>
  },
  "strengths": ["strength 1", "strength 2"],
  "gaps": ["improvement area 1", "improvement area 2"],
  "redFlags": [],
  "improvedAnswer": "A polished, interview-ready version of their answer that would strongly impress the interviewer."
}

Scoring guide:
- clarity: how clearly structured and easy to follow
- relevance: how directly it addresses the question and role
- depth: level of specific detail, examples, and insight
- confidence: assertiveness and professional tone

Keep strengths/gaps to 2-3 bullet points each. Only populate redFlags if there is something genuinely problematic. The improvedAnswer should be 3-5 sentences, natural and authentic.`,
    {
      task:      'interview_eval',
      system:    'You are a senior hiring manager and interview coach. Be honest, specific, and constructive.',
      maxTokens: 600,
      userId:    user.id,
      isFreeUser: !isPro,
    },
  )

  // ── Deduct credits after successful AI call ────────────────────────────────
  const afterCredits = await deductCredits(user.id, 'interviewEval', admin)

  return NextResponse.json({
    ...result,
    creditCost:       creditCost,
    creditsRemaining: afterCredits?.remainingCredits ?? creditBalance.remainingCredits - creditCost,
  })
}
