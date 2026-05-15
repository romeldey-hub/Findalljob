import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { calculateImprovedScore } from '@/lib/ai/optimizer'
import { parseResumeFromPDF } from '@/lib/ai/parser'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import { FREE_LIMITS } from '@/lib/limits'
import { readOpenAIV2OptimizedResume } from '@/lib/openai-search/optimized-storage'
import { optimizeResumeWithOpenAIForV2 } from '@/lib/openai-search/resume-optimizer'
import type { ParsedResume } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

type OpenAIV2ResultRow = {
  id: string
  search_run_id: string
  title: string
  company: string
  location: string
  description: string
  apply_url: string | null
  final_score: number
  match_reasons: unknown
  missing_skills: unknown
  resume_fix_suggestions: unknown
}

function reconstructResumeText(p: ParsedResume): string {
  if (p.sections?.length) {
    const header = [p.name, p.email, p.phone, p.location].filter(Boolean).join('\n')
    const body = p.sections.map((s) => `\n${s.title.toUpperCase()}\n${s.content}`).join('\n')
    return (header + body).trim()
  }

  const lines: string[] = []
  if (p.name) lines.push(p.name)
  if (p.email) lines.push(p.email)
  if (p.phone) lines.push(p.phone)
  if (p.location) lines.push(p.location)
  if (p.summary) lines.push('\nSUMMARY\n' + p.summary)
  if (p.experience?.length) {
    lines.push('\nEXPERIENCE')
    for (const exp of p.experience) {
      lines.push(`${exp.title} at ${exp.company} (${exp.start_date} - ${exp.end_date ?? 'Present'})`)
      for (const bullet of exp.bullets ?? []) lines.push(`- ${bullet}`)
    }
  }
  if (p.skills?.length) lines.push('\nSKILLS\n' + p.skills.join(', '))
  if (p.education?.length) {
    lines.push('\nEDUCATION')
    for (const edu of p.education) {
      lines.push(`${edu.degree} ${edu.field} - ${edu.school} (${edu.graduation_year})`)
    }
  }
  if (p.certifications?.length) lines.push('\nCERTIFICATIONS\n' + p.certifications.join('\n'))
  return lines.join('\n')
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'string' ? item : String(item))).filter(Boolean)
}

function validUrl(value?: string | null) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function buildOptimizationDescription(job: OpenAIV2ResultRow) {
  const suggestions = toStringList(job.resume_fix_suggestions)
  const reasons = toStringList(job.match_reasons)
  const missingSkills = toStringList(job.missing_skills)

  return [
    job.description,
    '',
    'OPENAI SEARCH V2 RESUME FIX SUGGESTIONS',
    'Use the following suggestions as direct optimization instructions, but only where they are truthful and supported by the resume. Do not invent experience, employers, tools, metrics, certifications, or achievements.',
    ...suggestions.slice(0, 3).map((suggestion) => `- ${suggestion}`),
    '',
    'WHY THIS JOB MATCHES',
    ...reasons.slice(0, 6).map((reason) => `- ${reason}`),
    '',
    'MISSING OR WEAKER AREAS TO ADDRESS TRUTHFULLY',
    ...missingSkills.slice(0, 8).map((skill) => `- ${skill}`),
  ].join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { resultId } = await request.json() as { resultId?: string }
  if (!resultId) return NextResponse.json({ error: 'resultId required' }, { status: 400 })

  const adminClient = createAdminClient()

  const { data: job, error: jobError } = await adminClient
    .from('openai_search_results')
    .select('id, search_run_id, title, company, location, description, apply_url, final_score, match_reasons, missing_skills, resume_fix_suggestions')
    .eq('id', resultId)
    .eq('user_id', user.id)
    .single<OpenAIV2ResultRow>()

  if (jobError || !job) return NextResponse.json({ error: 'OpenAI V2 job not found' }, { status: 404 })
  if (!validUrl(job.apply_url)) return NextResponse.json({ error: 'This V2 job has no valid apply URL' }, { status: 400 })

  const cached = await readOpenAIV2OptimizedResume(adminClient, user.id, resultId)
  if (cached) {
    return NextResponse.json({
      optimizedData: cached.optimizedData,
      jobTitle: job.title,
      company: job.company,
      location: job.location ?? '',
      description: job.description ?? '',
      applyUrl: job.apply_url,
      isFreePreview: false,
      fromCache: true,
    })
  }

  const { data: baseProfile } = await adminClient
    .from('profiles')
    .select('subscription_status, plan_tier')
    .eq('user_id', user.id)
    .single()

  const { data: extProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const { data: billingProfile } = await adminClient
    .from('profiles')
    .select('pro_until')
    .eq('user_id', user.id)
    .single()

  const effectiveProUntil = await resolveProUntil(
    adminClient,
    user.id,
    baseProfile?.subscription_status,
    billingProfile?.pro_until,
  )
  const isPro = isProUser(user.email, extProfile?.role, baseProfile?.subscription_status, effectiveProUntil)
  const planTier = (baseProfile?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')

  const JOB_OPTIMIZE_MONTHLY_LIMIT = 3
  const thisMonth = new Date().toISOString().slice(0, 7)
  let proCurrentCount = 0
  let proCreditCost = 0
  let freeUsedToday = 0
  let freeToday = ''

  if (!isPro) {
    freeToday = new Date().toISOString().slice(0, 10)
    const { data: freeQuota } = await adminClient
      .from('profiles')
      .select('optimize_free_daily_count, optimize_free_date')
      .eq('user_id', user.id)
      .single()
    const isToday = freeQuota?.optimize_free_date === freeToday
    freeUsedToday = isToday ? (freeQuota?.optimize_free_daily_count ?? 0) : 0
    if (freeUsedToday >= FREE_LIMITS.optimizationsPerDay) {
      return NextResponse.json(
        { requiresUpgrade: true, error: "You've used your free optimization preview for today. Upgrade to keep tailoring your resume for every job." },
        { status: 402 },
      )
    }
  } else {
    const { data: quotaRow } = await adminClient
      .from('profiles')
      .select('job_optimize_month_count, job_optimize_month')
      .eq('user_id', user.id)
      .single()
    const currentMonth = quotaRow?.job_optimize_month ?? ''
    proCurrentCount = currentMonth === thisMonth ? (quotaRow?.job_optimize_month_count ?? 0) : 0
    if (proCurrentCount >= JOB_OPTIMIZE_MONTHLY_LIMIT) {
      return NextResponse.json(
        { error: `Monthly limit reached: you can optimize your resume for ${JOB_OPTIMIZE_MONTHLY_LIMIT} specific jobs per month. Resets on the 1st.` },
        { status: 429 },
      )
    }

    const { allowed, balance, cost } = await checkCredits(user.id, 'jobOptimize', isPro, adminClient, planTier)
    if (!allowed) {
      return NextResponse.json(
        insufficientCreditsResponse('jobOptimize', balance.remainingCredits),
        { status: 402 },
      )
    }
    proCreditCost = cost
  }

  const resumeResult = await supabase
    .from('resumes')
    .select('id, raw_text, parsed_data, file_url')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (resumeResult.error || !resumeResult.data) {
    return NextResponse.json({ error: 'No active resume found' }, { status: 404 })
  }

  const { file_url } = resumeResult.data
  let rawText: string = resumeResult.data.raw_text ?? ''

  if (!rawText || rawText.length < 50) {
    const parsed = resumeResult.data.parsed_data as ParsedResume | null
    if (parsed?.name) {
      rawText = reconstructResumeText(parsed)
    } else if (file_url) {
      try {
        const fileRes = await fetch(file_url)
        if (!fileRes.ok) throw new Error('Could not download resume file')
        const buffer = Buffer.from(await fileRes.arrayBuffer())
        const reparsed = await parseResumeFromPDF(buffer, user.id, !isPro)
        rawText = reconstructResumeText(reparsed)
      } catch (error) {
        console.error('[openai-search/optimize] resume re-parse failed:', error)
        return NextResponse.json({ error: 'Could not read resume content. Please re-upload your resume.' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: 'Resume has no readable content. Please re-upload your resume.' }, { status: 400 })
    }
  }

  const originalScore = Math.max(0, Math.min(100, job.final_score ?? 0))
  let optimizedData
  try {
    optimizedData = await optimizeResumeWithOpenAIForV2({
      resumeText: rawText,
      jobTitle: job.title,
      jobDescription: buildOptimizationDescription(job),
      company: job.company,
      originalScore,
      userId: user.id,
      isFreeUser: !isPro,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[openai-search/optimize] OpenAI optimization failed:', message)
    return NextResponse.json({ error: `AI optimization failed: ${message}` }, { status: 500 })
  }

  if (originalScore > 0 && optimizedData.score_improvements) {
    optimizedData.ats_score = calculateImprovedScore(originalScore, optimizedData.score_improvements)
    optimizedData.original_score = originalScore
  } else if (originalScore > 0 && optimizedData.ats_score < originalScore) {
    optimizedData.ats_score = originalScore
    optimizedData.original_score = originalScore
  }

  if (!isPro) {
    void adminClient
      .from('profiles')
      .update({ optimize_free_daily_count: freeUsedToday + 1, optimize_free_date: freeToday })
      .eq('user_id', user.id)

    return NextResponse.json({
      optimizedData,
      jobTitle: job.title,
      company: job.company,
      location: job.location ?? '',
      description: job.description ?? '',
      applyUrl: job.apply_url,
      isFreePreview: true,
    })
  }

  const afterCredits = await deductCredits(user.id, 'jobOptimize', adminClient)
  void adminClient
    .from('profiles')
    .update({
      job_optimize_month_count: proCurrentCount + 1,
      job_optimize_month: thisMonth,
    })
    .eq('user_id', user.id)

  return NextResponse.json({
    optimizedData,
    jobTitle: job.title,
    company: job.company,
    location: job.location ?? '',
    description: job.description ?? '',
    applyUrl: job.apply_url,
    isFreePreview: false,
    creditCost: proCreditCost,
    creditsUsed: proCreditCost,
    creditsRemaining: afterCredits?.remainingCredits ?? 0,
  })
}
