import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateLight } from '@/lib/ai/client'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { checkRateLimit, userRateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import type { ParsedResume } from '@/types'

export const maxDuration = 30

// Question focus areas — cover different dimensions across 5 questions
const QUESTION_THEMES: Record<number, string> = {
  2: 'a specific technical challenge or project accomplishment',
  3: 'teamwork, collaboration, or conflict resolution',
  4: 'handling failure, learning, or adapting to change',
  5: 'career goals and why this specific company/role is the right fit',
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { questionNumber, previousQuestions, jobTitle, company, jobDescription } = await req.json()
  if (!questionNumber || !jobTitle) {
    return NextResponse.json({ error: 'questionNumber and jobTitle are required' }, { status: 400 })
  }

  // ── Rate limit: 8 questions / minute / user ────────────────────────────────
  {
    const adminForRl = createAdminClient()
    const rlResult = await checkRateLimit(
      userRateLimitKey(user.id, 'interview_next'),
      'interview_next',
      adminForRl,
    )
    if (!rlResult.allowed) {
      console.warn(`[interview/next] rate-limited | user=${user.id}`)
      return NextResponse.json(rateLimitResponse(rlResult), { status: 429 })
    }
  }

  // ── Backend pro enforcement + credit check (Q2+ only) ────────────────────
  // Free users may only access Q1 — Q2+ requires Pro regardless of frontend state
  // Q2+ also costs 0.5 credits each (interviewEval feature key)
  let isPro = false
  let planTier = 'free'
  let creditCost = 0
  let creditBalance = null

  if (questionNumber > 1) {
    const admin = createAdminClient()
    const [{ data: baseProfile }, { data: billingRow }, { data: roleRow }] = await Promise.all([
      admin.from('profiles').select('subscription_status, plan_tier').eq('user_id', user.id).single(),
      admin.from('profiles').select('pro_until').eq('user_id', user.id).single(),
      admin.from('profiles').select('role').eq('user_id', user.id).single(),
    ])
    const effectiveProUntil = await resolveProUntil(
      admin, user.id, baseProfile?.subscription_status, billingRow?.pro_until,
    )
    isPro = isProUser(user.email, roleRow?.role, baseProfile?.subscription_status, effectiveProUntil)
    if (!isPro) {
      return NextResponse.json({ requiresUpgrade: true }, { status: 402 })
    }
    planTier = (baseProfile?.plan_tier as string | null) ?? 'pro'

    const { allowed, balance, cost } = await checkCredits(user.id, 'interviewEval', isPro, admin, planTier)
    if (!allowed) {
      console.warn(`[interview/next] insufficient credits | user=${user.id} | remaining=${balance.remainingCredits}`)
      return NextResponse.json(insufficientCreditsResponse('interviewEval', balance.remainingCredits), { status: 402 })
    }
    creditCost = cost
    creditBalance = balance
  }

  const { data: resume } = await supabase
    .from('resumes')
    .select('parsed_data')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const parsed = resume?.parsed_data as ParsedResume | null

  const candidateContext = parsed
    ? [
        parsed.skills?.length ? `Skills: ${parsed.skills.slice(0, 10).join(', ')}` : null,
        parsed.experience?.length
          ? `Experience: ${parsed.experience.slice(0, 3).map(e => `${e.title} at ${e.company}`).join('; ')}`
          : null,
      ].filter(Boolean).join('\n')
    : 'No resume provided.'

  const theme = QUESTION_THEMES[questionNumber] ?? 'professional skills or situational judgment'

  const question = await generateLight(
    `Generate interview question #${questionNumber} for this candidate.

JOB: ${jobTitle} at ${company}
DESCRIPTION: ${(jobDescription ?? '').slice(0, 500)}

CANDIDATE:
${candidateContext}

FOCUS AREA: Ask about ${theme}.

QUESTIONS ALREADY ASKED (do NOT repeat or overlap these):
${(previousQuestions as string[]).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

Rules:
- One clear, specific question only
- Must explore a genuinely different angle than previous questions
- Use STAR-friendly framing where appropriate ("Tell me about a time when…", "Describe a situation where…")
- Return ONLY the question text`,
    { task: `interview_q${questionNumber}`, system: 'You are a professional interviewer conducting a structured mock interview. Generate targeted, thoughtful questions.', maxTokens: 150, userId: user.id, isFreeUser: false },
  )

  // ── Deduct credits for Q2+ after successful AI generation ─────────────────
  if (questionNumber > 1) {
    const admin = createAdminClient()
    const afterCredits = await deductCredits(user.id, 'interviewEval', admin)
    console.log(
      `[interview/next] question generated | user=${user.id} | q=${questionNumber}` +
      ` | cost=${creditCost} | remaining=${afterCredits?.remainingCredits ?? (creditBalance?.remainingCredits ?? 0) - creditCost}`
    )
  }

  return NextResponse.json({ question: question.trim(), questionNumber })
}
