import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import {
  candidateContextFromResume,
  generateOpenAIV2InterviewQuestion,
} from '@/lib/openai-search/interview'
import {
  readOpenAIV2InterviewPrep,
  saveOpenAIV2InterviewPrep,
  type OpenAIV2InterviewPrepPayload,
} from '@/lib/openai-search/interview-storage'
import type { ParsedResume } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 60

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'string' ? item : String(item))).filter(Boolean)
}

function v2ContextFromJob(job: {
  final_score: number
  match_reasons: unknown
  missing_skills: unknown
  resume_fix_suggestions: unknown
}) {
  return [
    `Final score: ${job.final_score}/100`,
    `Why this matches: ${toStringList(job.match_reasons).slice(0, 5).join('; ') || 'Not provided'}`,
    `Missing skills: ${toStringList(job.missing_skills).slice(0, 8).join(', ') || 'None listed'}`,
    `Resume fix suggestions: ${toStringList(job.resume_fix_suggestions).slice(0, 5).join('; ') || 'None listed'}`,
  ].join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { resultId, jobTitle, company, jobDescription } = await request.json() as {
    resultId?: string
    jobTitle?: string
    company?: string
    jobDescription?: string
  }
  if (!resultId) return NextResponse.json({ error: 'resultId required' }, { status: 400 })
  if (!jobTitle || !company) return NextResponse.json({ error: 'jobTitle and company are required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: job, error: jobError } = await admin
    .from('openai_search_results')
    .select('id, search_run_id, title, company, location, description, apply_url, final_score, match_reasons, missing_skills, resume_fix_suggestions')
    .eq('id', resultId)
    .eq('user_id', user.id)
    .single()

  if (jobError || !job) return NextResponse.json({ error: 'OpenAI V2 job not found' }, { status: 404 })

  const cached = await readOpenAIV2InterviewPrep(admin, user.id, resultId)
  if (cached) {
    return NextResponse.json({
      question: cached.question,
      questionNumber: 1,
      fromCache: true,
    })
  }

  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until, plan_tier')
    .eq('user_id', user.id)
    .single()
  const effectiveProUntil = await resolveProUntil(admin, user.id, profileRow?.subscription_status, profileRow?.pro_until)
  const isPro = isProUser(user.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
  const planTier = (profileRow?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')

  const { allowed, balance, cost } = await checkCredits(user.id, 'interviewSession', isPro, admin, planTier)
  if (!allowed) {
    return NextResponse.json(
      insufficientCreditsResponse('interviewSession', balance.remainingCredits),
      { status: 402 },
    )
  }

  const { data: resume } = await supabase
    .from('resumes')
    .select('parsed_data')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const candidateContext = candidateContextFromResume(resume?.parsed_data as ParsedResume | null)
  const question = await generateOpenAIV2InterviewQuestion({
    questionNumber: 1,
    jobTitle,
    company,
    jobDescription: job.description || jobDescription || '',
    candidateContext,
    v2Context: v2ContextFromJob(job),
  })

  const afterCredits = await deductCredits(user.id, 'interviewSession', admin)
  const now = new Date().toISOString()
  const payload: OpenAIV2InterviewPrepPayload = {
    resultId,
    userId: user.id,
    searchRunId: job.search_run_id,
    question,
    job: {
      title: job.title ?? '',
      company: job.company ?? '',
      location: job.location ?? '',
      description: job.description ?? '',
      applyUrl: job.apply_url ?? '',
      finalScore: job.final_score ?? 0,
      whyThisMatches: toStringList(job.match_reasons),
      missingSkills: toStringList(job.missing_skills),
      resumeFixSuggestions: toStringList(job.resume_fix_suggestions),
    },
    createdAt: now,
    updatedAt: now,
  }
  await saveOpenAIV2InterviewPrep(admin, payload)

  return NextResponse.json({
    question,
    questionNumber: 1,
    creditCost: cost,
    creditsUsed: cost,
    creditsRemaining: afterCredits?.remainingCredits ?? 0,
  })
}
