import { computeVerifiedLabel } from '@/types'
import type { ApplyStatus } from '@/types'
import type { MatchRecord } from '@/components/jobs/JobCard'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

type JobSnapshot = MatchRecord['job'] & {
  company_logo_url?: string | null
  country?: string | null
  remote_status?: string | null
  job_type?: string | null
  experience_level?: string | null
  company_website?: string | null
  company_info?: unknown
  match_label?: string | null
  ranking_text?: string | null
  tags?: unknown[]
  badges?: unknown[]
}

export type AppliedJobRow = {
  id: string
  application_id?: string | null
  original_job_id?: string | null
  original_job_match_id?: string | null
  job_title: string
  company_name: string
  company_logo_url?: string | null
  location: string
  country?: string | null
  remote_status?: string | null
  job_type?: string | null
  experience_level?: string | null
  posted_at?: string | null
  salary?: string | null
  job_source?: string | null
  original_job_url: string
  apply_url?: string | null
  apply_status?: ApplyStatus | null
  verified_label?: string | null
  match_score: number
  match_label?: string | null
  ranking_text?: string | null
  tags?: unknown[]
  badges?: unknown[]
  full_job_description: string
  why_this_matches?: string | null
  match_reasons?: string[]
  skill_matches?: string[]
  skill_gaps?: string[]
  bridge_advice?: string | null
  company_website?: string | null
  company_info?: unknown
  optimized_resume_snapshot?: OptimizedResumeData | null
  optimized_resume_score?: number | null
  optimized_resume_view_data?: unknown
  optimized_resume_download_data?: unknown
  card_snapshot: MatchRecord
  applied_at: string
  removed_at?: string | null
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function matchLabel(score: number): string {
  if (score >= 80) return 'Strong Match'
  if (score >= 60) return 'Good Match'
  if (score >= 20) return 'Fair Match'
  return 'Weak'
}

function rankingText(score: number): string {
  if (score >= 85) return 'Top 10%'
  if (score >= 75) return 'Top 20%'
  if (score >= 65) return 'Top 35%'
  return 'Top 50%'
}

export function buildAppliedJobPayload(input: {
  userId: string
  applicationId?: string | null
  jobId: string
  matchSnapshot?: MatchRecord | null
  optimizedSnapshot?: OptimizedResumeData | null
  fallbackJob?: Record<string, unknown> | null
}) {
  const fallback = input.fallbackJob ?? {}
  const match = input.matchSnapshot
  const job = (match?.job ?? fallback) as JobSnapshot & Record<string, unknown>
  const score = Math.max(0, Math.min(100, Number(match?.ai_score ?? 0) || 0))
  const applyStatus = job.apply_status as ApplyStatus | undefined
  const lastVerifiedAt = fallback.last_verified_at as string | null | undefined
  const verifiedLabel = (job.verified_label as string | undefined) ?? computeVerifiedLabel(applyStatus, lastVerifiedAt)
  const explicitMatchLabel = typeof job.match_label === 'string' && job.match_label.trim()
    ? job.match_label.trim()
    : null
  const explicitRankingText = typeof job.ranking_text === 'string' && job.ranking_text.trim()
    ? job.ranking_text.trim()
    : null
  const cardSnapshot: MatchRecord = match ?? {
    id: input.applicationId ?? input.jobId,
    ai_score: score,
    ai_reasoning: '',
    bridge_advice: '',
    match_reasons: [],
    matched_skills: [],
    missing_skills: [],
    job: {
      id: input.jobId,
      title: String(job.title ?? ''),
      company: String(job.company ?? ''),
      location: String(job.location ?? ''),
      url: String(job.url ?? ''),
      apply_url: job.apply_url as string | undefined,
      apply_status: applyStatus,
      verified_label: verifiedLabel as MatchRecord['job']['verified_label'],
      salary: job.salary as string | undefined,
      description: String(job.description ?? ''),
      source: job.source as string | undefined,
      created_at: job.created_at as string | undefined,
    },
  }
  const optimizedScore = typeof input.optimizedSnapshot?.ats_score === 'number'
    ? input.optimizedSnapshot.ats_score
    : null

  return {
    user_id: input.userId,
    application_id: input.applicationId ?? null,
    original_job_id: input.jobId,
    original_job_match_id: match?.id ?? null,
    job_title: String(job.title ?? ''),
    company_name: String(job.company ?? ''),
    company_logo_url: job.company_logo_url ?? null,
    location: String(job.location ?? ''),
    country: job.country ?? null,
    remote_status: job.remote_status ?? null,
    job_type: job.job_type ?? null,
    experience_level: job.experience_level ?? null,
    posted_at: (job.created_at as string | undefined) ?? null,
    salary: (job.salary as string | undefined) ?? null,
    job_source: (job.source as string | undefined) ?? null,
    original_job_url: String(job.url ?? ''),
    apply_url: (job.apply_url as string | undefined) ?? null,
    apply_status: applyStatus ?? null,
    verified_label: verifiedLabel,
    match_score: score,
    match_label: explicitMatchLabel ?? matchLabel(score),
    ranking_text: explicitRankingText ?? rankingText(score),
    tags: Array.isArray(job.tags) ? job.tags : [],
    badges: Array.isArray(job.badges) ? job.badges : [],
    full_job_description: String(job.description ?? ''),
    why_this_matches: match?.ai_reasoning ?? '',
    match_reasons: asArray(match?.match_reasons),
    skill_matches: asArray(match?.matched_skills),
    skill_gaps: asArray(match?.missing_skills),
    bridge_advice: match?.bridge_advice ?? '',
    company_website: job.company_website ?? null,
    company_info: job.company_info ?? null,
    optimized_resume_snapshot: input.optimizedSnapshot ?? null,
    optimized_resume_score: optimizedScore,
    optimized_resume_view_data: input.optimizedSnapshot ?? null,
    optimized_resume_download_data: input.optimizedSnapshot ?? null,
    card_snapshot: cardSnapshot,
    applied_at: new Date().toISOString(),
    removed_at: null,
  }
}

export function appliedJobToMatch(row: AppliedJobRow): MatchRecord {
  if (row.card_snapshot?.job) return row.card_snapshot
  return {
    id: row.original_job_match_id ?? row.id,
    ai_score: row.match_score ?? 0,
    ai_reasoning: row.why_this_matches ?? '',
    bridge_advice: row.bridge_advice ?? '',
    match_reasons: row.match_reasons ?? [],
    matched_skills: row.skill_matches ?? [],
    missing_skills: row.skill_gaps ?? [],
    job: {
      id: row.original_job_id ?? row.id,
      title: row.job_title,
      company: row.company_name,
      location: row.location,
      url: row.original_job_url,
      apply_url: row.apply_url ?? undefined,
      apply_status: row.apply_status ?? undefined,
      verified_label: row.verified_label as MatchRecord['job']['verified_label'],
      salary: row.salary ?? undefined,
      description: row.full_job_description,
      source: row.job_source ?? undefined,
      created_at: row.posted_at ?? undefined,
    },
  }
}
