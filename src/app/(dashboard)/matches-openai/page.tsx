'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Briefcase,
  Building2,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Mic,
  Search,
  Sparkles,
  Upload,
  UserCheck,
  Wand2,
} from 'lucide-react'
import { PaywallModal } from '@/components/PaywallModal'
import { InterviewModal } from '@/components/InterviewModal'
import { OpenAIV2CompanyModal } from '@/components/openai-search/OpenAIV2CompanyModal'
import { OpenAIV2OptimizeFlow } from '@/components/openai-search/OpenAIV2OptimizeFlow'
import { ResumePreviewModal } from '@/components/resume/ResumePreviewModal'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'
import { sourceLabel } from '@/components/jobs/ApplyButton'
import type { MatchRecord } from '@/components/jobs/JobCard'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const RESUME_FIX_FALLBACK = 'Your resume already looks aligned for this role. No major changes suggested.'
const PLACEHOLDER_SUGGESTION_PATTERN = /^(?:n[\s./-]?a|none|null|undefined|-|—|no suggestions?|not applicable|empty|\[\])\.?$/i

type OpenAIResult = {
  id: string
  rank_position: number
  final_score: number
  local_score?: number
  match_label: string
  source: string
  title: string
  company: string
  location: string
  description: string
  url: string
  apply_url?: string | null
  posted_at?: string | null
  salary?: string | null
  matched_skills?: string[]
  missing_skills?: string[]
  match_reasons?: string[]
  concerns?: string[]
  resume_fix_suggestions?: string[]
}

type OpenAIRun = {
  id: string
  status: string
  target_count: number
  saved_count: number
  search_mode?: string | null
  country_code?: string | null
  country_name?: string | null
  failure_reason?: string | null
  created_at?: string
  fetched_count?: number
  normalized_count?: number
  deduped_count?: number
  location_filtered_count?: number
  role_filtered_count?: number
  scored_count?: number
  candidate_profile?: {
    role_family?: string
    target_titles?: string[]
    location_preference?: string
    search_queries?: string[]
  } | null
  source_fetch_counts?: {
    diagnostics?: {
      v2_test_resume_used?: boolean
      v2_test_resume_file_name?: string | null
      v2_test_resume_character_count?: number | null
      inferred_search_scope?: {
        searchMode?: string | null
        countryCode?: string | null
        countryName?: string | null
      } | null
    }
  } | null
}

type Diagnostic = {
  id: string
  stage: string
  count_value?: number | null
  details?: Record<string, unknown> | null
}

type V2TestResume = {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  rawTextLength: number
  uploadedAt: string
}

type MatchFilter = 'all' | 'strong' | 'good' | 'possible'

type OpenAIV2OptimizedResume = {
  resultId: string
  searchRunId: string
  optimizedData: OptimizedResumeData
  createdAt: string
  updatedAt: string
}

type OpenAIV2InterviewPrep = {
  resultId: string
  searchRunId: string
  question: string
  createdAt: string
  updatedAt: string
}

type AppliedJobLite = {
  id: string
  original_job_id?: string | null
}

function asText(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value == null) return ''
  return JSON.stringify(value)
}

function toList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asText).filter(Boolean) : []
}

function meaningfulSuggestions(value: unknown): string[] {
  const seen = new Set<string>()
  const suggestions: string[] = []
  for (const item of toList(value)) {
    const cleaned = item.trim()
    if (!cleaned || PLACEHOLDER_SUGGESTION_PATTERN.test(cleaned)) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push(cleaned)
  }
  return suggestions
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `Posted ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function compactDateTime(value?: string) {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function readCount(diagnostics: Diagnostic[], stage: string) {
  return diagnostics.find((item) => item.stage === stage)?.count_value ?? null
}

function readDetailCount(diagnostics: Diagnostic[], stage: string, key: string) {
  const value = diagnostics.find((item) => item.stage === stage)?.details?.[key]
  return typeof value === 'number' ? value : null
}

function extractExperience(description: string, title?: string): string {
  const text = `${title ?? ''} ${description ?? ''}`
  const range = text.match(/(\d+)\s*[-–to]+\s*(\d+)\s*(?:years?|yrs?)/i)
  if (range) return `${range[1]}-${range[2]} yrs`
  const plus = text.match(/(\d+)\+\s*(?:years?|yrs?)/i)
  if (plus) return `${plus[1]}+ yrs`
  const minimum = text.match(/(?:minimum|at\s*least|min\.?)\s*(\d+)\s*(?:years?|yrs?)/i)
  if (minimum) return `${minimum[1]}+ yrs`
  const single = text.match(/(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:exp|experience)/i)
  if (single) return `${single[1]} yrs`

  const normalized = (title ?? '').toLowerCase()
  if (/\b(vp|vice president|director|architect)\b/.test(normalized)) return '10+ yrs'
  if (/\b(manager|head)\b/.test(normalized)) return '8+ yrs'
  if (/\b(lead|principal|staff)\b/.test(normalized)) return '7+ yrs'
  if (/\b(senior|sr\.?)\b/.test(normalized)) return '5+ yrs'
  return ''
}

function extractJobType(description: string): string {
  const text = description.toLowerCase()
  if (/\bcontract\b|\bfreelance\b|\bcontractor\b/.test(text)) return 'Contract'
  if (/\bpart[-\s]?time\b/.test(text)) return 'Part-time'
  if (/\binternship\b|\bintern\b/.test(text)) return 'Internship'
  if (/\bfull[-\s]?time\b/.test(text)) return 'Full-time'
  return ''
}

function matchTier(score: number, label: string) {
  if (label === 'strong' || score >= 75) return { label: 'Strong Match' }
  if (label === 'good' || score >= 60) return { label: 'Good Match' }
  return { label: 'Possible Match' }
}

function isValidUrl(value?: string | null) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function buildV2AppliedSnapshot(
  job: OpenAIResult,
  optimizedResume?: OptimizedResumeData | null,
  interviewPrep?: OpenAIV2InterviewPrep | null
): MatchRecord {
  const reasons = toList(job.match_reasons)
  const matchedSkills = toList(job.matched_skills)
  const missingSkills = toList(job.missing_skills)
  const resumeFixSuggestions = toList(job.resume_fix_suggestions)
  const tier = matchTier(job.final_score, job.match_label)
  const jobType = extractJobType(job.description)
  const experience = extractExperience(job.description, job.title)

  return {
    id: job.id,
    ai_score: job.final_score,
    ai_reasoning: reasons.join('\n'),
    bridge_advice: resumeFixSuggestions.join('\n'),
    match_reasons: reasons,
    matched_skills: matchedSkills,
    missing_skills: missingSkills,
    rank_position: job.rank_position,
    job: {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url || job.apply_url || '',
      apply_url: job.apply_url || job.url || undefined,
      apply_status: 'unverified',
      verified_label: 'unverified',
      salary: job.salary ?? undefined,
      description: job.description,
      source: job.source,
      created_at: job.posted_at ?? undefined,
      job_type: jobType || null,
      experience_level: experience || null,
      match_label: tier.label,
      ranking_text: `Rank #${job.rank_position}`,
      tags: missingSkills,
      badges: [
        { label: tier.label, tone: job.match_label },
        { label: `Rank #${job.rank_position}` },
        { label: sourceLabel(job.source) || job.source },
      ].filter((badge) => badge.label),
      v2_result_id: job.id,
      v2_raw_match_label: job.match_label,
      v2_resume_fix_suggestions: resumeFixSuggestions,
      v2_concerns: toList(job.concerns),
      v2_interview_prep: interviewPrep ?? null,
      v2_optimized_resume_available: Boolean(optimizedResume),
    } as MatchRecord['job'] & Record<string, unknown>,
  } as MatchRecord
}

function StatRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-[12px] dark:border-[#334155] dark:bg-[#263549]/40">
      <span className="text-gray-500 dark:text-slate-400">{label}</span>
      <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{value ?? '—'}</span>
    </div>
  )
}

function V2ScoreRing({ score }: { score: number }) {
  const radius = 27
  const circumference = 2 * Math.PI * radius
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference
  const color = score >= 75 ? '#16A34A' : score >= 60 ? '#2563EB' : score >= 40 ? '#D97706' : '#94A3B8'

  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center sm:h-16 sm:w-16">
      <svg width="64" height="64" viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="4.5" className="dark:stroke-[#334155]" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4.5"
          strokeLinecap="round"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference - filled,
          }}
        />
      </svg>
      <span className="relative z-10 text-[18px] font-black leading-none text-[#0F172A] dark:text-[#F1F5F9] sm:text-[19px]">{score}</span>
    </div>
  )
}

function V2JobCard({
  job,
  hasOptimizedResume,
  optimizedResume,
  onFixResume,
  onViewFixedResume,
  hasInterviewPrep,
  interviewPrep,
  onPrepareInterview,
  onKnowCompany,
  initialIsApplied,
  appliedJobId,
  onAppliedChanged,
}: {
  job: OpenAIResult
  hasOptimizedResume: boolean
  optimizedResume?: OptimizedResumeData | null
  onFixResume: (job: OpenAIResult) => void
  onViewFixedResume: (job: OpenAIResult) => void
  hasInterviewPrep: boolean
  interviewPrep?: OpenAIV2InterviewPrep | null
  onPrepareInterview: (job: OpenAIResult) => void
  onKnowCompany: (job: OpenAIResult) => void
  initialIsApplied: boolean
  appliedJobId?: string
  onAppliedChanged: () => void
}) {
  const [isApplied, setIsApplied] = useState(initialIsApplied)
  const [applyingToggle, setApplyingToggle] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [confirmPos, setConfirmPos] = useState<{ top: number; left: number } | null>(null)
  const appliedBtnRef = useRef<HTMLButtonElement>(null)
  const visibleReasons = toList(job.match_reasons).slice(0, 3)
  const resumeFixSuggestions = meaningfulSuggestions(job.resume_fix_suggestions).slice(0, 3)
  const showResumeFixFallback = resumeFixSuggestions.length === 0
  const resumeFixItems = showResumeFixFallback ? [RESUME_FIX_FALLBACK] : resumeFixSuggestions
  const posted = formatDate(job.posted_at)
  const jobType = extractJobType(job.description)
  const experience = extractExperience(job.description, job.title)
  const src = sourceLabel(job.source)
  const secondaryBtn = 'inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[11px] font-medium text-gray-500 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-all sm:w-auto sm:justify-start sm:py-1.5'
  const blueOutlineBtn = 'inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 text-[11px] font-medium text-blue-400 dark:text-blue-500 hover:border-blue-500 dark:hover:border-blue-500 hover:text-[#2563EB] dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all sm:w-auto sm:justify-start sm:py-1.5'
  const primaryBtn = 'inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-2 text-[11px] font-semibold text-white transition-all hover:bg-blue-700 hover:shadow-sm active:scale-[0.99] disabled:opacity-60 whitespace-nowrap sm:w-auto sm:py-1.5'
  const disabledResumeBtn = 'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-[11px] font-medium text-blue-400 opacity-40 cursor-not-allowed transition-none dark:border-blue-800 dark:text-blue-500 sm:w-auto sm:justify-start sm:py-1.5'
  const fixResumeDisabled = showResumeFixFallback && !hasOptimizedResume

  useEffect(() => {
    setIsApplied(initialIsApplied)
  }, [initialIsApplied])

  useEffect(() => {
    if (!showRemoveConfirm) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowRemoveConfirm(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showRemoveConfirm])

  function handleToggleApplied() {
    if (applyingToggle) return
    if (isApplied) {
      if (appliedBtnRef.current) {
        const rect = appliedBtnRef.current.getBoundingClientRect()
        setConfirmPos({
          top: rect.bottom + 6,
          left: Math.min(rect.left, window.innerWidth - 264),
        })
      }
      setShowRemoveConfirm(true)
      return
    }
    void handleMarkAsApplied()
  }

  async function handleMarkAsApplied() {
    setApplyingToggle(true)
    try {
      const matchSnapshot = buildV2AppliedSnapshot(job, optimizedResume, interviewPrep)
      const res = await fetch('/api/applied-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          matchSnapshot,
          ...(optimizedResume ? { optimizedSnapshot: optimizedResume } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to mark as applied')

      setIsApplied(true)
      setShowRemoveConfirm(false)
      toast.success('Marked as applied')
      globalMutate('/api/applied-jobs')
      onAppliedChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as applied')
    } finally {
      setApplyingToggle(false)
    }
  }

  async function handleConfirmRemove() {
    setShowRemoveConfirm(false)
    setApplyingToggle(true)
    try {
      const params = new URLSearchParams(appliedJobId ? { id: appliedJobId } : { jobId: job.id })
      const res = await fetch(`/api/applied-jobs?${params.toString()}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to remove applied status')

      setIsApplied(false)
      toast.success('Removed from Applied Jobs')
      globalMutate('/api/applied-jobs')
      onAppliedChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove applied status')
    } finally {
      setApplyingToggle(false)
    }
  }

  return (
    <article className="job-card animate-fade-in-up group rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-[2px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.07)] dark:border-[#334155] dark:bg-[#1E293B] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.35)] sm:p-6">
      <div>
        <div className="mb-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex flex-shrink-0 items-center" style={{ overflow: 'visible' }}>
              <V2ScoreRing score={job.final_score} />
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="mb-1 text-[16px] font-bold leading-snug text-[#0F172A] dark:text-[#F1F5F9] sm:text-[17px]">
                {job.title}
              </h2>

              <div className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-400 dark:text-slate-500 sm:flex">
                <span className="flex items-center gap-1 font-semibold text-gray-600 dark:text-slate-300">
                  <Building2 className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-slate-500" />{job.company}
                </span>
                {job.location && (
                  <>
                    <span className="text-gray-200 dark:text-slate-700">·</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 flex-shrink-0" />{job.location}
                    </span>
                  </>
                )}
                {jobType && (
                  <>
                    <span className="text-gray-200 dark:text-slate-700">·</span>
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3 flex-shrink-0" />{jobType}
                    </span>
                  </>
                )}
                {experience && (
                  <>
                    <span className="text-gray-200 dark:text-slate-700">·</span>
                    <span className="flex items-center gap-1">
                      <UserCheck className="h-3 w-3 flex-shrink-0 text-gray-300 dark:text-slate-600" />{experience}
                    </span>
                  </>
                )}
                {posted && (
                  <>
                    <span className="text-gray-200 dark:text-slate-700">·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 flex-shrink-0" />{posted}
                    </span>
                  </>
                )}
                {src && (
                  <>
                    <span className="text-gray-200 dark:text-slate-700">·</span>
                    <span className="inline-flex items-center rounded border border-[#E5E7EB] bg-[#F1F5F9] px-1.5 py-0.5 text-[9px] font-semibold text-gray-400 dark:border-[#334155] dark:bg-[#263549] dark:text-slate-500">
                      {src}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-400 dark:text-slate-500 sm:hidden">
            <span className="flex items-center gap-1 font-semibold text-gray-600 dark:text-slate-300">
              <Building2 className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-slate-500" />{job.company}
            </span>
            {job.location && (
              <>
                <span className="text-gray-200 dark:text-slate-700">·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 flex-shrink-0" />{job.location}
                </span>
              </>
            )}
            {jobType && (
              <>
                <span className="text-gray-200 dark:text-slate-700">·</span>
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3 flex-shrink-0" />{jobType}
                </span>
              </>
            )}
            {experience && (
              <>
                <span className="text-gray-200 dark:text-slate-700">·</span>
                <span className="flex items-center gap-1">
                  <UserCheck className="h-3 w-3 flex-shrink-0 text-gray-300 dark:text-slate-600" />{experience}
                </span>
              </>
            )}
            {posted && (
              <>
                <span className="text-gray-200 dark:text-slate-700">·</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 flex-shrink-0" />{posted}
                </span>
              </>
            )}
            {src && (
              <>
                <span className="text-gray-200 dark:text-slate-700">·</span>
                <span className="inline-flex items-center rounded border border-[#E5E7EB] bg-[#F1F5F9] px-1.5 py-0.5 text-[9px] font-semibold text-gray-400 dark:border-[#334155] dark:bg-[#263549] dark:text-slate-500">
                  {src}
                </span>
              </>
            )}
          </div>
        </div>

          {visibleReasons.length > 0 && (
            <div className="mb-5 rounded-xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/70 px-4 py-3.5 dark:border-[#334155]/80 dark:bg-[#263549]/35">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-slate-500">
                Why this matches you
              </p>
              <div className="space-y-1.5">
                {visibleReasons.map((reason, index) => (
                  <div key={`${job.id}-reason-${index}`} className="flex items-start gap-2">
                    <span className="mt-px flex-shrink-0 text-[11px] leading-[1.6] text-green-500 dark:text-green-400">✔</span>
                    <span className="text-[12px] leading-[1.7] text-gray-600 dark:text-slate-300">{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/45 px-4 py-3.5 dark:border-blue-900/35 dark:bg-blue-950/15">
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-slate-500">
              Resume fix suggestions
            </p>
            <div className="space-y-1.5">
              {resumeFixItems.map((suggestion, index) => (
                <div key={`${job.id}-fix-${index}`} className="flex items-start gap-2">
                  {showResumeFixFallback ? (
                    <span className="mt-px flex-shrink-0 text-[11px] leading-[1.6] text-green-500 dark:text-green-400">✔</span>
                  ) : (
                    <Wand2 className="mt-1 h-3 w-3 flex-shrink-0 text-[#2563EB] dark:text-blue-400" />
                  )}
                  <span className="text-[12px] leading-[1.7] text-gray-600 dark:text-slate-300">{suggestion}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-1 flex flex-col gap-2 border-t border-[#E5E7EB]/80 pt-4 dark:border-[#334155]/80 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex w-full flex-col gap-2 sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => hasOptimizedResume ? onViewFixedResume(job) : fixResumeDisabled ? undefined : onFixResume(job)}
                disabled={fixResumeDisabled}
                title={fixResumeDisabled ? 'No major resume changes suggested for this role.' : undefined}
                className={fixResumeDisabled ? disabledResumeBtn : blueOutlineBtn}
              >
                {hasOptimizedResume ? <CheckCircle2 className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />}
                {hasOptimizedResume ? 'View Fixed Resume' : 'Fix Resume For This Job'}
              </button>

              <button type="button" onClick={() => onPrepareInterview(job)} className={blueOutlineBtn}>
                <Mic className="h-3 w-3" />
                {hasInterviewPrep ? 'View Interview Prep' : 'Prepare For This Interview'}
              </button>

              <button type="button" onClick={() => onKnowCompany(job)} className={secondaryBtn}>
                <Building2 className="h-3 w-3" />
                Know the Company
              </button>

              <button
                type="button"
                ref={appliedBtnRef}
                onClick={handleToggleApplied}
                disabled={applyingToggle}
                title={isApplied ? 'Remove applied status' : 'Mark as applied'}
                className={isApplied
                  ? 'inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-[11px] font-semibold text-green-600 transition-all hover:bg-green-100 disabled:opacity-50 dark:border-green-800 dark:bg-green-900/20 dark:text-green-500 dark:hover:bg-green-900/30'
                  : `${secondaryBtn} disabled:opacity-50`
                }
              >
                {applyingToggle
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : isApplied
                    ? <CheckCircle2 className="h-3 w-3" />
                    : <Circle className="h-3 w-3" />
                }
                {isApplied ? 'Applied' : 'Mark as Applied'}
              </button>
            </div>

            {showRemoveConfirm && confirmPos && createPortal(
              <>
                <div className="fixed inset-0 z-[200]" onClick={() => setShowRemoveConfirm(false)} />
                <div
                  className="fixed z-[201] w-64 rounded-xl border border-[#E5E7EB] bg-white p-3.5 shadow-lg dark:border-[#334155] dark:bg-[#1E293B]"
                  style={{ top: confirmPos.top, left: confirmPos.left }}
                >
                  <p className="mb-1 text-[13px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Remove from Applied Jobs?</p>
                  <p className="mb-3 text-[12px] leading-snug text-gray-500 dark:text-slate-400">This job will be removed from your Applied Jobs list.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRemoveConfirm(false)}
                      className="flex-1 rounded-lg border border-[#E5E7EB] py-1.5 text-[12px] font-medium text-gray-600 transition-all hover:bg-[#F8FAFC] dark:border-[#334155] dark:text-slate-400 dark:hover:bg-[#263549]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRemove}
                      className="flex-1 rounded-lg bg-red-600 py-1.5 text-[12px] font-bold text-white transition-all hover:bg-red-700"
                    >
                      Yes, Remove
                    </button>
                  </div>
                </div>
              </>,
              document.body
            )}

            <div className="flex w-full flex-shrink-0 items-center sm:ml-auto sm:w-auto">
              <a
                href={job.apply_url ?? ''}
                target="_blank"
                rel="noopener noreferrer"
                className={primaryBtn}
              >
                Open Job <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
    </article>
  )
}

export default function OpenAIJobSearchPage() {
  const { data, isLoading, mutate } = useSWR<{
    run: OpenAIRun | null
    results: OpenAIResult[]
    count: number
    error?: string
  }>('/api/openai-search/results', fetcher)
  const runId = data?.run?.id
  const { data: diagnosticsData } = useSWR<{ diagnostics: Diagnostic[] }>(
    runId ? `/api/openai-search/diagnostics?runId=${runId}` : null,
    fetcher
  )
  const { data: testResumeData, mutate: mutateTestResume } = useSWR<{
    testResume: V2TestResume | null
  }>('/api/openai-search/test-resume', fetcher)
  const { data: optimizedData, mutate: mutateOptimizedResumes } = useSWR<{
    resumes: OpenAIV2OptimizedResume[]
  }>('/api/openai-search/optimized-resumes', fetcher)
  const { data: interviewPrepData, mutate: mutateInterviewPreps } = useSWR<{
    preps: OpenAIV2InterviewPrep[]
  }>('/api/openai-search/interview-preps', fetcher)
  const { data: appliedData, mutate: mutateAppliedJobs } = useSWR<{
    appliedJobs: AppliedJobLite[]
  }>('/api/applied-jobs', fetcher)
  const { data: profileData } = useSWR<{
    plan?: string
    credits_remaining?: number | null
  }>('/api/profile', fetcher)
  const [running, setRunning] = useState(false)
  const [runStatusMessage, setRunStatusMessage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<MatchFilter>('all')
  const [optimizingJob, setOptimizingJob] = useState<OpenAIResult | null>(null)
  const [viewFixedJob, setViewFixedJob] = useState<OpenAIResult | null>(null)
  const [interviewJob, setInterviewJob] = useState<OpenAIResult | null>(null)
  const [companyJob, setCompanyJob] = useState<OpenAIResult | null>(null)
  const [savingFixedResume, setSavingFixedResume] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  const [showInterviewPaywall, setShowInterviewPaywall] = useState(false)
  const [localOptimizedResumes, setLocalOptimizedResumes] = useState<Map<string, OptimizedResumeData>>(() => new Map())

  async function startSearch() {
    if (running) return
    setRunning(true)
    setError(null)
    setRunStatusMessage('Validating AI credits and starting OpenAI V2 search…')
    try {
      const res = await fetch('/api/openai-search/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testResumeId: testResumeData?.testResume?.id ?? null }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.requiresUpgrade) {
          setShowPaywall(true)
          toast.error(json.error || 'Not enough AI credits to run OpenAI Search V2.')
          return
        }
        if (json.code === 'SEARCH_ALREADY_RUNNING') {
          toast.info(json.error || 'OpenAI V2 search is already running.')
          return
        }
        throw new Error(json.error || 'OpenAI search failed')
      }
      await mutate()
      await Promise.all([
        globalMutate('/api/profile'),
        globalMutate('/api/credits/usage'),
      ])
      if (typeof json.creditsUsed === 'number' && json.creditsUsed > 0) {
        toast.success(`OpenAI V2 search complete. ${json.creditsUsed} AI credit${json.creditsUsed === 1 ? '' : 's'} used.`)
      } else {
        toast.success('OpenAI V2 search complete. No AI credits were used.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OpenAI search failed'
      setError(message)
      toast.error(message)
    } finally {
      setRunning(false)
      setRunStatusMessage(null)
    }
  }

  async function uploadTestResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.set('file', file)
      const res = await fetch('/api/openai-search/test-resume', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'V2 test resume upload failed')
      await mutateTestResume()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'V2 test resume upload failed')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const results = data?.results ?? []
  const run = data?.run ?? null
  const testResume = testResumeData?.testResume ?? null
  const diagnostics = diagnosticsData?.diagnostics ?? []
  const savedOptimizedResumes = optimizedData?.resumes ?? []
  const savedInterviewPreps = interviewPrepData?.preps ?? []
  const optimizedResumeMap = new Map<string, OptimizedResumeData>(
    savedOptimizedResumes.map((item) => [item.resultId, item.optimizedData])
  )
  for (const [resultId, data] of localOptimizedResumes) {
    optimizedResumeMap.set(resultId, data)
  }
  const interviewPrepIds = new Set(savedInterviewPreps.map((prep) => prep.resultId))
  const interviewPrepMap = new Map<string, OpenAIV2InterviewPrep>(
    savedInterviewPreps.map((prep) => [prep.resultId, prep])
  )
  const appliedJobMap = new Map<string, string>(
    (appliedData?.appliedJobs ?? [])
      .filter((item) => item.original_job_id)
      .map((item) => [item.original_job_id as string, item.id])
  )
  const runDiagnostics = run?.source_fetch_counts?.diagnostics
  const renderableResults = results.filter((job) => isValidUrl(job.apply_url))
  const visibleResults = activeFilter === 'all'
    ? renderableResults
    : renderableResults.filter((job) => job.match_label === activeFilter)
  const cardCounts = {
    strong: renderableResults.filter((job) => job.match_label === 'strong').length,
    good: renderableResults.filter((job) => job.match_label === 'good').length,
    possible: renderableResults.filter((job) => job.match_label === 'possible').length,
  }
  const diagnosticsCounts = {
    openaiInput: readCount(diagnostics, 'openai_input_count'),
    openaiReturned: readCount(diagnostics, 'openai_returned_count'),
    strong: readDetailCount(diagnostics, 'openai_returned_count', 'strong_count'),
    good: readDetailCount(diagnostics, 'openai_returned_count', 'good_count'),
    possible: readDetailCount(diagnostics, 'openai_returned_count', 'possible_count'),
    weakReject: readDetailCount(diagnostics, 'openai_returned_count', 'weak_reject_count'),
    expansionAttempts: readCount(diagnostics, 'expansion_attempts_used'),
  }
  const showScarcity = run && run.saved_count < run.target_count && run.failure_reason
  const fixedResumeData = viewFixedJob ? optimizedResumeMap.get(viewFixedJob.id) : null

  async function saveFixedResumeEdits(editedData: OptimizedResumeData) {
    if (!viewFixedJob) return
    setSavingFixedResume(true)
    try {
      const res = await fetch('/api/openai-search/optimize/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultId: viewFixedJob.id, optimizedData: editedData }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save fixed resume edits')
      setLocalOptimizedResumes((prev) => {
        const next = new Map(prev)
        next.set(viewFixedJob.id, editedData)
        return next
      })
      await mutateOptimizedResumes()
    } finally {
      setSavingFixedResume(false)
    }
  }

  function handlePrepareInterview(job: OpenAIResult) {
    const credits = profileData?.credits_remaining
    const INTERVIEW_COST = 2
    if (credits != null && credits < INTERVIEW_COST) {
      setShowInterviewPaywall(true)
      return
    }
    setInterviewJob(job)
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-3 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[12px] font-bold text-[#2563EB] dark:border-blue-900/50 dark:bg-[#1E3A5F]/40 dark:text-blue-300">
          OpenAI Search V2 Beta
        </div>
        <h1 className="text-2xl font-black tracking-tight text-[#0F172A] dark:text-[#F1F5F9] sm:text-3xl">
          OpenAI Job Search Engine
        </h1>
        <p className="mt-2 text-[13px] text-gray-500 dark:text-slate-400">
          Experimental job matching engine. Results may vary.
        </p>
        <Link
          href="/matches"
          className="mt-3 inline-flex text-[12px] font-semibold text-[#2563EB] hover:text-blue-700 dark:text-blue-300"
        >
          Back to Current Matched Jobs
        </Link>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row">
        <section className="min-w-0 flex-1 space-y-5">
          {isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white shadow-sm dark:border-[#334155] dark:bg-[#1E293B]">
              <Loader2 className="h-5 w-5 animate-spin text-[#2563EB]" />
            </div>
          ) : renderableResults.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-6 text-center shadow-sm dark:border-[#334155] dark:bg-[#1E293B]">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB] dark:bg-[#1E3A5F]/40 dark:text-blue-300">
                <Search className="h-5 w-5" />
              </div>
              <p className="text-[14px] font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                Search results will appear here.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  ['all', 'All', renderableResults.length, ''],
                  ['strong', 'Strong', cardCounts.strong, 'bg-green-500'],
                  ['good', 'Good', cardCounts.good, 'bg-blue-500'],
                  ['possible', 'Possible', cardCounts.possible, 'bg-amber-500'],
                ] as const).map(([filter, label, count, dot]) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-all ${
                      activeFilter === filter
                        ? 'border-transparent bg-[#0F172A] text-white dark:bg-[#2563EB]'
                        : 'border-[#E5E7EB] bg-white text-gray-500 hover:border-gray-300 dark:border-[#334155] dark:bg-[#1E293B] dark:text-slate-400 dark:hover:border-slate-500'
                    }`}
                  >
                    {dot && <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />}
                    {label}
                    <span className={`rounded-sm px-1 py-0.5 text-[10px] font-bold ${
                      activeFilter === filter ? 'bg-white/20' : 'bg-[#F1F5F9] text-gray-400 dark:bg-[#263549] dark:text-slate-500'
                    }`}>{count}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-5">
              {visibleResults.map((job) => (
                <V2JobCard
                  key={job.id}
                  job={job}
                  hasOptimizedResume={optimizedResumeMap.has(job.id)}
                  optimizedResume={optimizedResumeMap.get(job.id)}
                  onFixResume={setOptimizingJob}
                  onViewFixedResume={setViewFixedJob}
                  hasInterviewPrep={interviewPrepIds.has(job.id)}
                  interviewPrep={interviewPrepMap.get(job.id)}
                  onPrepareInterview={handlePrepareInterview}
                  onKnowCompany={setCompanyJob}
                  initialIsApplied={appliedJobMap.has(job.id)}
                  appliedJobId={appliedJobMap.get(job.id)}
                  onAppliedChanged={() => {
                    void mutateAppliedJobs()
                  }}
                />
              ))}
              </div>
            </>
          )}
        </section>

        <aside className="w-full flex-shrink-0 xl:w-60">
        <div className="flex flex-col gap-5 [@media(min-width:1280px)_and_(min-height:700px)]:sticky [@media(min-width:1280px)_and_(min-height:700px)]:top-6">
        <div className="h-fit rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm dark:border-[#334155] dark:bg-[#1E293B]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] dark:bg-[#1E3A5F]/40 dark:text-blue-300">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-[13px] font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
              Search Engine V2
            </h2>
          </div>

          <div className="mt-6 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4 dark:border-[#475569] dark:bg-[#263549]/40">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg text-[12px] font-semibold text-[#0F172A] transition hover:text-[#2563EB] dark:text-[#F1F5F9] dark:hover:text-blue-300">
              <span className="inline-flex items-center gap-2">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload Resume for V2 Test
              </span>
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={uploading || running}
                onChange={uploadTestResume}
              />
            </label>

            <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-slate-400">
              This test resume is used only by OpenAI Search V2 Beta and will not change your main resume.
            </p>

            {testResume ? (
              <div className="mt-3 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs dark:border-[#334155] dark:bg-[#1E293B]">
                <p className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{testResume.fileName}</p>
                <p className="mt-1 text-gray-500 dark:text-slate-400">
                  Ready for V2 search · {testResume.rawTextLength.toLocaleString()} characters parsed
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs font-medium text-gray-500 dark:text-slate-400">
                No V2 test resume uploaded yet. Searches will use your active resume.
              </p>
            )}

            {uploadError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                {uploadError}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={startSearch}
            disabled={running}
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0F172A] px-4 py-2.5 text-[12px] font-bold text-white transition-all hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#2563EB] dark:hover:bg-blue-700"
          >
            {running ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Running…</> : 'Run New OpenAI Search'}
          </button>

          {runStatusMessage && (
            <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
              {runStatusMessage}
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              {error}
            </p>
          )}

          {run && (
            <div className="mt-5 space-y-2">
              <StatRow label="Run status" value={run.status} />
              <StatRow label="Run ID" value={run.id.slice(0, 8)} />
              <StatRow label="Target count" value={run.target_count} />
              <StatRow label="Saved count" value={run.saved_count} />
              <StatRow label="Search mode" value={run.search_mode ?? '—'} />
              <StatRow label="Country/location" value={run.country_name ?? run.country_code ?? '—'} />
              <StatRow label="Created" value={compactDateTime(run.created_at)} />
              {showScarcity && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-300">
                  {run.failure_reason}
                </div>
              )}
            </div>
          )}
        </div>

        {run?.candidate_profile && (
          <div className="h-fit rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm dark:border-[#334155] dark:bg-[#1E293B]">
            <h2 className="text-[13px] font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
              V2 Profile Debug
            </h2>
            <div className="mt-4 space-y-2">
              <StatRow label="Uploaded resume" value={runDiagnostics?.v2_test_resume_file_name ?? 'Active resume'} />
              <StatRow label="Parsed characters" value={runDiagnostics?.v2_test_resume_character_count ?? testResume?.rawTextLength} />
              <StatRow label="Role family" value={run.candidate_profile.role_family ?? '—'} />
              <StatRow label="Location preference" value={run.candidate_profile.location_preference ?? '—'} />
              <StatRow
                label="Inferred scope"
                value={
                  runDiagnostics?.inferred_search_scope?.countryName ??
                  runDiagnostics?.inferred_search_scope?.countryCode ??
                  runDiagnostics?.inferred_search_scope?.searchMode ??
                  '—'
                }
              />
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500">Target titles</p>
                <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-slate-300">
                  {(run.candidate_profile.target_titles ?? []).slice(0, 6).join(', ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500">Search queries</p>
                <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-slate-300">
                  {(run.candidate_profile.search_queries ?? []).slice(0, 5).join(', ') || '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="h-fit rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm dark:border-[#334155] dark:bg-[#1E293B]">
          <h2 className="text-[13px] font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9]">
            Diagnostics Summary
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-2">
            <StatRow label="Fetched" value={run?.fetched_count} />
            <StatRow label="Normalized" value={run?.normalized_count} />
            <StatRow label="Deduped" value={run?.deduped_count} />
            <StatRow label="After location filter" value={run?.location_filtered_count} />
            <StatRow label="After role filter" value={run?.role_filtered_count} />
            <StatRow label="Pre-scored" value={run?.scored_count} />
            <StatRow label="OpenAI input" value={diagnosticsCounts.openaiInput} />
            <StatRow label="OpenAI returned" value={diagnosticsCounts.openaiReturned} />
            <StatRow label="Strong" value={diagnosticsCounts.strong ?? cardCounts.strong} />
            <StatRow label="Good" value={diagnosticsCounts.good ?? cardCounts.good} />
            <StatRow label="Possible" value={diagnosticsCounts.possible ?? cardCounts.possible} />
            <StatRow label="Weak rejected" value={diagnosticsCounts.weakReject} />
            <StatRow label="Saved" value={run?.saved_count} />
            <StatRow label="Expansion attempts used" value={diagnosticsCounts.expansionAttempts} />
          </div>
        </div>
        </div>
        </aside>
      </div>

      {optimizingJob && (
        <OpenAIV2OptimizeFlow
          resultId={optimizingJob.id}
          onClose={() => setOptimizingJob(null)}
          onUpgradeRequired={() => setShowPaywall(true)}
          onLocalSaved={(resultId, optimizedResume) => {
            setLocalOptimizedResumes((prev) => {
              const next = new Map(prev)
              next.set(resultId, optimizedResume)
              return next
            })
          }}
          onSaved={() => {
            void mutateOptimizedResumes()
          }}
        />
      )}

      {fixedResumeData && viewFixedJob && (
        <ResumePreviewModal
          data={fixedResumeData}
          onClose={() => setViewFixedJob(null)}
          onSaveEdits={saveFixedResumeEdits}
          isSaving={savingFixedResume}
          heading="Optimized Resume for This Job"
          previewSubtitle="Loaded from your saved OpenAI V2 optimization."
          startInEditMode={false}
          isOptimizedPreview
          viewMode
        />
      )}

      {interviewJob && (
        <InterviewModal
          job={{
            id: interviewJob.id,
            title: interviewJob.title,
            company: interviewJob.company,
            description: interviewJob.description,
          }}
          isPro={profileData?.plan === 'pro'}
          mode="job-based"
          apiBasePath="/api/openai-search/interview"
          requestContext={{
            resultId: interviewJob.id,
            applyUrl: interviewJob.apply_url,
            finalScore: interviewJob.final_score,
            location: interviewJob.location,
            whyThisMatches: toList(interviewJob.match_reasons),
            missingSkills: toList(interviewJob.missing_skills),
            resumeFixSuggestions: toList(interviewJob.resume_fix_suggestions),
          }}
          onPrepared={() => {
            void mutateInterviewPreps()
          }}
          onClose={() => setInterviewJob(null)}
        />
      )}

      {companyJob && (
        <OpenAIV2CompanyModal
          job={companyJob}
          onClose={() => setCompanyJob(null)}
        />
      )}

      {showPaywall && (
        <PaywallModal
          onClose={() => setShowPaywall(false)}
          onMaybeLater={() => setShowPaywall(false)}
        />
      )}

      {showInterviewPaywall && (
        <PaywallModal
          variant="interview"
          onClose={() => setShowInterviewPaywall(false)}
          onMaybeLater={() => setShowInterviewPaywall(false)}
        />
      )}
    </div>
  )
}
