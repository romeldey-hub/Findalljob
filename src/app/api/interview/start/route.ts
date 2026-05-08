import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateLight } from '@/lib/ai/client'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import type { ParsedResume } from '@/types'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until, plan_tier')
    .eq('user_id', user.id)
    .single()
  const effectiveProUntil = await resolveProUntil(admin, user.id, profileRow?.subscription_status, profileRow?.pro_until)
  const isPro    = isProUser(user.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
  const planTier = (profileRow?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')

  // Credit check: full interview session costs 2 credits
  const { allowed: creditAllowed, balance: creditBalance, cost: creditCost } =
    await checkCredits(user.id, 'interviewSession', isPro, admin, planTier)
  if (!creditAllowed) {
    return NextResponse.json(
      insufficientCreditsResponse('interviewSession', creditBalance.remainingCredits),
      { status: 402 }
    )
  }

  const { jobTitle, company, jobDescription } = await req.json()
  if (!jobTitle || !company) {
    return NextResponse.json({ error: 'jobTitle and company are required' }, { status: 400 })
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
        parsed.name ? `Name: ${parsed.name}` : null,
        parsed.skills?.length ? `Skills: ${parsed.skills.slice(0, 12).join(', ')}` : null,
        parsed.experience?.length
          ? `Experience: ${parsed.experience.map(e => `${e.title} at ${e.company}`).join('; ')}`
          : null,
        parsed.summary ? `Summary: ${parsed.summary.slice(0, 300)}` : null,
      ].filter(Boolean).join('\n')
    : 'No resume provided.'

  const question = await generateLight(
    `Generate the opening interview question for this candidate and role.

JOB: ${jobTitle} at ${company}
DESCRIPTION: ${(jobDescription ?? '').slice(0, 800)}

CANDIDATE:
${candidateContext}

Rules:
- Ask one clear, specific question
- Make it conversational and welcoming
- For Q1, use "Tell me about yourself" style but tailored to the specific role
- Return ONLY the question text, nothing else`,
    { task: 'interview_q1', system: 'You are a professional interviewer conducting a structured mock interview. Generate targeted, thoughtful questions.', maxTokens: 150, userId: user.id, isFreeUser: !isPro },
  )

  const afterCredits = await deductCredits(user.id, 'interviewSession', admin)

  return NextResponse.json({
    question:         question.trim(),
    questionNumber:   1,
    creditCost:       creditCost,
    creditsUsed:      creditCost,
    creditsRemaining: afterCredits?.remainingCredits ?? 0,
  })
}
