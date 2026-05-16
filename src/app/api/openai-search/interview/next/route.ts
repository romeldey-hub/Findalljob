import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import {
  candidateContextFromResume,
  generateOpenAIV2InterviewQuestion,
} from '@/lib/openai-search/interview'
import type { ParsedResume } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 60

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'string' ? item : String(item))).filter(Boolean)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { resultId, questionNumber, previousQuestions, jobTitle, company, jobDescription } = await request.json() as {
    resultId?: string
    questionNumber?: number
    previousQuestions?: string[]
    jobTitle?: string
    company?: string
    jobDescription?: string
  }
  if (!resultId) return NextResponse.json({ error: 'resultId required' }, { status: 400 })
  if (!questionNumber || !jobTitle || !company) {
    return NextResponse.json({ error: 'questionNumber, jobTitle, and company are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until, plan_tier')
    .eq('user_id', user.id)
    .single()
  const effectiveProUntil = await resolveProUntil(admin, user.id, profileRow?.subscription_status, profileRow?.pro_until)
  const isPro = isProUser(user.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
  const planTier = (profileRow?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')

  const { allowed, balance, cost } = await checkCredits(user.id, 'interviewEval', isPro, admin, planTier)
  if (!allowed) {
    return NextResponse.json(
      insufficientCreditsResponse('interviewEval', balance.remainingCredits),
      { status: 402 },
    )
  }

  const [{ data: job, error: jobError }, { data: resume }] = await Promise.all([
    admin
      .from('openai_search_results')
      .select('description, final_score, match_reasons, missing_skills, resume_fix_suggestions')
      .eq('id', resultId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('resumes')
      .select('parsed_data')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (jobError || !job) return NextResponse.json({ error: 'OpenAI V2 job not found' }, { status: 404 })

  const question = await generateOpenAIV2InterviewQuestion({
    questionNumber,
    previousQuestions: previousQuestions ?? [],
    jobTitle,
    company,
    jobDescription: job.description || jobDescription || '',
    candidateContext: candidateContextFromResume(resume?.parsed_data as ParsedResume | null),
    v2Context: [
      `Final score: ${job.final_score}/100`,
      `Why this matches: ${toStringList(job.match_reasons).slice(0, 5).join('; ') || 'Not provided'}`,
      `Missing skills: ${toStringList(job.missing_skills).slice(0, 8).join(', ') || 'None listed'}`,
      `Resume fix suggestions: ${toStringList(job.resume_fix_suggestions).slice(0, 5).join('; ') || 'None listed'}`,
    ].join('\n'),
    usage: {
      userId: user.id,
      userEmail: user.email ?? null,
      isFreeUser: !isPro,
      creditsCharged: cost,
      creditFeatureKey: 'interviewEval',
      jobId: resultId,
      companyName: company,
    },
  })

  const afterCredits = await deductCredits(user.id, 'interviewEval', admin)

  return NextResponse.json({
    question,
    questionNumber,
    creditCost: cost,
    creditsUsed: cost,
    creditsRemaining: afterCredits?.remainingCredits ?? 0,
  })
}
