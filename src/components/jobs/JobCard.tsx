'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Building2, MapPin, Briefcase, Loader2, CheckCircle2,
  Clock, User, UserCheck, Mic, Download, Trash2, Wand2, Circle,
} from 'lucide-react'
import { toast } from 'sonner'
import { mutate as globalMutate } from 'swr'
import { useCountUp, useAnimate } from '@/lib/useAnimations'
import { ApplyButton } from '@/components/jobs/ApplyButton'
import { KnowTheCompanyModal } from '@/components/jobs/KnowTheCompanyModal'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

// ── MatchRecord ───────────────────────────────────────────────────────────────

export interface MatchRecord {
  id: string
  ai_score: number
  ai_reasoning: string
  rank_position?: number
  bridge_advice?: string
  match_reasons?: string[]
  matched_skills: string[]
  missing_skills: string[]
  job: {
    id: string
    title: string
    company: string
    location: string
    url: string
    apply_url?: string
    apply_status?: 'active' | 'broken' | 'unverified'
    verified_label?: 'verified' | 'stale' | 'unverified'
    salary?: string
    description: string
    source?: string
    created_at?: string
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function recruiterReasonFromSkill(skill: string) {
  return `Strong alignment with ${skill}`
}

export const NEGATIVE_REASON_PATTERN = /\b(missing|gap|gaps|lacks?|weak|limited|preferred|required|needs?|should|could improve|without|not enough|no experience)\b/i
const RESUME_FIX_FALLBACK = 'Your resume already looks aligned for this role. No major changes suggested.'
const PLACEHOLDER_SUGGESTION_PATTERN = /^(?:n[\s./-]?a|none|null|undefined|-|—|no suggestions?|not applicable|empty|\[\])\.?$/i

function meaningfulSuggestions(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const suggestions: string[] = []
  for (const value of values) {
    const cleaned = value?.trim()
    if (!cleaned || PLACEHOLDER_SUGGESTION_PATTERN.test(cleaned)) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push(cleaned)
  }
  return suggestions
}

export function extractExperience(description: string, title?: string): string | null {
  if (description) {
    const rangeMatch = description.match(/(\d+)\s*[-–to]+\s*(\d+)\s*(?:years?|yrs?)/i)
    if (rangeMatch) return `${rangeMatch[1]}–${rangeMatch[2]} yrs`
    const plusMatch = description.match(/(\d+)\+\s*(?:years?|yrs?)/i)
    if (plusMatch) return `${plusMatch[1]}+ yrs`
    const minMatch = description.match(/(?:minimum|at\s*least|min\.?)\s*(\d+)\s*(?:years?|yrs?)/i)
    if (minMatch) return `${minMatch[1]}+ yrs`
    const singleMatch = description.match(/(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:exp|experience)/i)
    if (singleMatch) return `${singleMatch[1]} yrs`
  }
  if (title) {
    const t = title.toLowerCase()
    if (/\barchitect\b/.test(t)) return '10+ yrs'
    if (/\b(vp|vice\s*president|director)\b/.test(t)) return '10+ yrs'
    if (/\b(manager|head\s*of)\b/.test(t)) return '8+ yrs'
    if (/\b(lead|principal|staff)\b/.test(t)) return '7+ yrs'
    if (/\b(senior|sr\.?)\b/.test(t)) return '5+ yrs'
    if (/\b(associate|mid[-\s]?level)\b/.test(t)) return '2–5 yrs'
    if (/\b(junior|jr\.?|entry[-\s]?level|fresher|trainee|graduate)\b/.test(t)) return '0–2 yrs'
  }
  return null
}

export function extractWorkMode(text: string): string {
  const t = text.toLowerCase()
  if (/\bremote\b/.test(t)) return 'Remote'
  if (/\bhybrid\b/.test(t)) return 'Hybrid'
  if (/\bon[-\s]?site\b/.test(t)) return 'On-site'
  return ''
}

export function extractJobType(text: string): string {
  const t = text.toLowerCase()
  if (/\bcontract\b|\bfreelance\b|\bcontractor\b/.test(t)) return 'Contract'
  if (/\bpart[-\s]?time\b/.test(t)) return 'Part-time'
  return 'Full-time'
}

export function extractExpMin(expLabel: string | null): number {
  if (!expLabel) return -1
  const m = expLabel.match(/(\d+)/)
  return m ? parseInt(m[1]) : -1
}

export function formatPostedDate(dateStr?: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Posted today'
  if (diffDays === 1) return 'Posted yesterday'
  if (diffDays <= 6)  return `Posted ${diffDays} days ago`
  if (diffDays <= 13) return 'Posted this week'
  return `Posted ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

// ── ScoreRing ─────────────────────────────────────────────────────────────────

const SPARKS = [
  { tx: '0px',   ty: '-38px', color: '#22C55E', dur: 1050, delay: 0   },
  { tx: '38px',  ty: '0px',   color: '#FBBF24', dur: 1100, delay: 55  },
  { tx: '0px',   ty: '38px',  color: '#22C55E', dur: 1050, delay: 28  },
  { tx: '-38px', ty: '0px',   color: '#34D399', dur: 1100, delay: 82  },
  { tx: '30px',  ty: '-50px', color: '#FBBF24', dur: 1550, delay: 70  },
  { tx: '50px',  ty: '-30px', color: '#86EFAC', dur: 1500, delay: 140 },
  { tx: '50px',  ty: '30px',  color: '#22C55E', dur: 1550, delay: 45  },
  { tx: '30px',  ty: '50px',  color: '#FCD34D', dur: 1500, delay: 115 },
  { tx: '-30px', ty: '50px',  color: '#34D399', dur: 1550, delay: 65  },
  { tx: '-50px', ty: '30px',  color: '#FBBF24', dur: 1500, delay: 130 },
  { tx: '-50px', ty: '-30px', color: '#22C55E', dur: 1550, delay: 95  },
  { tx: '-30px', ty: '-50px', color: '#86EFAC', dur: 1500, delay: 160 },
]

export function ScoreRing({ score, celebrate = false }: { score: number; celebrate?: boolean }) {
  const r      = 28
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ

  const ringColor = score >= 80 ? '#16A34A' : score >= 60 ? '#2563EB' : score >= 20 ? '#D97706' : '#9CA3AF'

  const prevScoreRef  = useRef(score)
  const countFromRef  = useRef(0)
  if (prevScoreRef.current !== score) {
    countFromRef.current  = prevScoreRef.current
    prevScoreRef.current  = score
  }

  const animated     = useAnimate()
  const displayScore = useCountUp(score, celebrate ? 1800 : 900, 0, countFromRef.current)

  return (
    <div className="relative flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16">
      <svg
        width="64" height="64" viewBox="0 0 64 64"
        className="absolute inset-0 h-full w-full -rotate-90"
        style={celebrate ? { animation: 'scoreGlow 3.5s ease-out forwards' } : undefined}
      >
        <circle cx="32" cy="32" r={r} fill="none" stroke="#F1F5F9" strokeWidth="4.5" className="dark:stroke-[#334155]" />
        <circle
          cx="32" cy="32" r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth="4.5"
          strokeLinecap="round"
          style={{
            strokeDasharray: circ,
            strokeDashoffset: animated ? circ - filled : circ,
            transition: animated ? 'stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)' : 'none',
          }}
        />
      </svg>

      {celebrate && (
        <div className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
          {SPARKS.map((s, i) => (
            <div
              key={i}
              className="absolute w-[6px] h-[6px] rounded-full"
              style={{
                top: '50%', left: '50%',
                marginTop: '-3px', marginLeft: '-3px',
                backgroundColor: s.color,
                '--tx': s.tx,
                '--ty': s.ty,
                animation: `scoreSpark ${s.dur}ms ease-out ${s.delay}ms forwards`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 text-center">
        <div className="text-[18px] font-black leading-none text-[#0F172A] dark:text-[#F1F5F9] sm:text-[19px]">{displayScore}</div>
      </div>
    </div>
  )
}

// ── JobCard ───────────────────────────────────────────────────────────────────

export function JobCard({
  match, onOptimize, onInterview,
  initialSaved = false, initialApplicationId,
  initialIsApplied = false,
  isOptimized = false, isManual = false, isNew = false,
  animIndex = 0,
  optimizedScore,
  celebrate = false,
  isOptimizing = false,
  onViewOptimized,
  onDownloadOptimized,
  onDeleteRequest,
  optimizedData = null,
  disableResumeActions = false,
}: {
  match: MatchRecord
  onOptimize: (id: string) => void
  onInterview: (match: MatchRecord) => void
  initialSaved?: boolean
  initialApplicationId?: string
  initialIsApplied?: boolean
  isOptimized?: boolean
  isManual?: boolean
  isNew?: boolean
  animIndex?: number
  optimizedScore?: number
  celebrate?: boolean
  isOptimizing?: boolean
  onViewOptimized?: () => void
  onDownloadOptimized?: () => void
  onDeleteRequest?: () => void
  /** Full optimized resume data — saved as snapshot when user clicks Apply. */
  optimizedData?: OptimizedResumeData | null
  /** Disable CTAs that require the user's active resume to still exist. */
  disableResumeActions?: boolean
}) {
  const { job } = match
  const [saved, setSaved]                   = useState(initialSaved)
  const [saving, setSaving]                 = useState(false)
  const [applicationId, setApplicationId]   = useState<string | undefined>(initialApplicationId)
  const [isApplied, setIsApplied]           = useState(initialIsApplied)
  const [applyingToggle, setApplyingToggle] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [showCompanyInfo, setShowCompanyInfo] = useState(false)
  const [confirmPos, setConfirmPos] = useState<{ top: number; left: number } | null>(null)
  const appliedBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSaved(initialSaved)
      setApplicationId(initialApplicationId)
      setIsApplied(initialIsApplied)
    }, 0)
    return () => clearTimeout(t)
  }, [initialSaved, initialApplicationId, initialIsApplied])

  async function handleApplyCallback() {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          status: 'applied',
          matchSnapshot: match,
          ...(optimizedData ? { optimizedSnapshot: optimizedData } : {}),
        }),
      })
      if (res.ok) {
        const d = await res.json()
        if (!saved) setSaved(true)
        if (d.application?.id) setApplicationId(d.application.id)
        globalMutate('/api/applications')
        globalMutate('/api/applied-jobs')
      }
    } catch { /* non-blocking */ }
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      if (saved && applicationId) {
        const res = await fetch(`/api/applications?id=${applicationId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setSaved(false)
        setApplicationId(undefined)
        toast.success('Removed from tracker')
        globalMutate('/api/applications')
      } else if (!saved) {
        const res = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id, status: 'saved' }),
        })
        if (!res.ok) throw new Error()
        const d = await res.json()
        setSaved(true)
        if (d.application?.id) setApplicationId(d.application.id)
        toast.success('Saved to tracker')
        globalMutate('/api/applications')
      }
    } catch { toast.error(saved ? 'Failed to remove' : 'Failed to save') }
    finally { setSaving(false) }
  }

  function handleToggleApplied() {
    if (applyingToggle) return
    if (isApplied) {
      if (appliedBtnRef.current) {
        const rect = appliedBtnRef.current.getBoundingClientRect()
        setConfirmPos({
          top:  rect.bottom + 6,
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
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          status: 'applied',
          matchSnapshot: match,
          ...(optimizedData ? { optimizedSnapshot: optimizedData } : {}),
        }),
      })
      if (res.ok) {
        const d = await res.json()
        setIsApplied(true)
        setSaved(true)
        if (d.application?.id) setApplicationId(d.application.id)
        globalMutate('/api/applications')
        globalMutate('/api/applied-jobs')
      }
    } catch { /* non-blocking */ }
    finally { setApplyingToggle(false) }
  }

  async function handleConfirmRemove() {
    setShowRemoveConfirm(false)
    if (!applicationId) return
    setApplyingToggle(true)
    try {
      const res = await fetch('/api/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: applicationId, status: 'saved' }),
      })
      if (res.ok) {
        setIsApplied(false)
        globalMutate('/api/applications')
        globalMutate('/api/applied-jobs')
      }
    } catch { /* non-blocking */ }
    finally { setApplyingToggle(false) }
  }

  useEffect(() => {
    if (!showRemoveConfirm) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setShowRemoveConfirm(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showRemoveConfirm])

  const matchReasons = (match.match_reasons?.length
    ? match.match_reasons
    : (match.matched_skills ?? []).map(recruiterReasonFromSkill)
  )
    .filter((reason) => reason && !NEGATIVE_REASON_PATTERN.test(reason))
    .slice(0, 4)
  const improvementSuggestions = meaningfulSuggestions(
    match.missing_skills?.length ? match.missing_skills : match.matched_skills ?? []
  ).slice(0, 3)
  const showResumeFixFallback = improvementSuggestions.length === 0
  const resumeFixItems = showResumeFixFallback ? [RESUME_FIX_FALLBACK] : improvementSuggestions
  const expLabel = extractExperience(job.description || match.ai_reasoning || '', job.title)
  const jobType  = extractJobType(job.description || '')

  const secondaryBtn   = 'inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[11px] font-medium text-gray-500 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-all sm:w-auto sm:justify-start sm:py-1.5'
  const blueOutlineBtn = 'inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 text-[11px] font-medium text-blue-400 dark:text-blue-500 hover:border-blue-500 dark:hover:border-blue-500 hover:text-[#2563EB] dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all sm:w-auto sm:justify-start sm:py-1.5'
  const disabledResumeBtn = 'inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 text-[11px] font-medium text-blue-400 dark:text-blue-500 opacity-40 cursor-not-allowed transition-none sm:w-auto sm:justify-start sm:py-1.5'
  const fixResumeDisabled = disableResumeActions || showResumeFixFallback

  const displayedScore = (!isOptimizing && isOptimized && optimizedScore != null)
    ? optimizedScore : match.ai_score

  void handleSave

  return (
    <div
      className={`job-card animate-fade-in-up group bg-white dark:bg-[#1E293B] rounded-2xl border shadow-sm hover:-translate-y-[2px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out p-5 sm:p-6 ${
        isNew
          ? 'border-[#2563EB] ring-2 ring-[#2563EB]/15 dark:ring-[#2563EB]/20'
          : 'border-[#E5E7EB] dark:border-[#334155]'
      }`}
      style={celebrate ? {
        animationName: 'cardCelebrate',
        animationDuration: '3.5s',
        animationTimingFunction: 'ease-out',
        animationFillMode: 'forwards',
        animationDelay: '0ms',
      } : {
        animationDelay: `${animIndex * 60}ms`,
      }}
    >
      <div>
        <div className="mb-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex flex-shrink-0 items-center" style={{ overflow: 'visible' }}>
              <ScoreRing score={displayedScore} celebrate={celebrate} />
            </div>

            <div className="min-w-0 flex-1">
              {isManual && (
              <span className="mb-1.5 inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-400">
                <User className="w-2.5 h-2.5" />Added by you
              </span>
              )}

              <h3 className="mb-1 text-[16px] font-bold leading-snug text-[#0F172A] dark:text-[#F1F5F9] sm:text-[17px]">
                {job.title}
              </h3>

              <div className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-400 dark:text-slate-500 sm:flex">
                <span className="flex items-center gap-1 font-semibold text-gray-600 dark:text-slate-300">
                  <Building2 className="w-3 h-3 text-gray-400 dark:text-slate-500 flex-shrink-0" />{job.company}
                </span>
                {job.location && (
                  <>
                    <span className="text-gray-200 dark:text-slate-700">·</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" />{job.location}
                    </span>
                  </>
                )}
                <span className="text-gray-200 dark:text-slate-700">·</span>
                <span className="flex items-center gap-1">
                  <Briefcase className="w-3 h-3 flex-shrink-0" />{jobType}
                </span>
                {expLabel && (
                  <>
                    <span className="text-gray-200 dark:text-slate-700">·</span>
                    <span className="flex items-center gap-1">
                      <UserCheck className="w-3 h-3 flex-shrink-0 text-gray-300 dark:text-slate-600" />{expLabel}
                    </span>
                  </>
                )}
                {job.salary && (
                  <>
                    <span className="text-gray-200 dark:text-slate-700">·</span>
                    <span className="font-medium text-gray-500 dark:text-slate-400">{job.salary}</span>
                  </>
                )}
                {formatPostedDate(job.created_at) && (
                  <>
                    <span className="text-gray-200 dark:text-slate-700">·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 flex-shrink-0" />{formatPostedDate(job.created_at)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-400 dark:text-slate-500 sm:hidden">
              <span className="font-semibold text-gray-600 dark:text-slate-300 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-gray-400 dark:text-slate-500 flex-shrink-0" />{job.company}
              </span>
              {job.location && (
                <>
                  <span className="text-gray-200 dark:text-slate-700">·</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" />{job.location}
                  </span>
                </>
              )}
              <span className="text-gray-200 dark:text-slate-700">·</span>
              <span className="flex items-center gap-1">
                <Briefcase className="w-3 h-3 flex-shrink-0" />{jobType}
              </span>
              {expLabel && (
                <>
                  <span className="text-gray-200 dark:text-slate-700">·</span>
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3 h-3 flex-shrink-0 text-gray-300 dark:text-slate-600" />{expLabel}
                  </span>
                </>
              )}
              {job.salary && (
                <>
                  <span className="text-gray-200 dark:text-slate-700">·</span>
                  <span className="font-medium text-gray-500 dark:text-slate-400">{job.salary}</span>
                </>
              )}
              {formatPostedDate(job.created_at) && (
                <>
                  <span className="text-gray-200 dark:text-slate-700">·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 flex-shrink-0" />{formatPostedDate(job.created_at)}
                  </span>
                </>
              )}
          </div>
        </div>

          {matchReasons.length > 0 && (
            <div className="mb-5 rounded-xl border border-[#E5E7EB]/70 bg-[#F8FAFC]/70 px-4 py-3.5 dark:border-[#334155]/80 dark:bg-[#263549]/35">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-slate-500">
                Why this matches you
              </p>
              <div className="space-y-1.5">
                {matchReasons.map((r: string) => (
                  <div key={r} className="flex items-start gap-2">
                    <span className="text-green-500 dark:text-green-400 text-[11px] leading-[1.6] flex-shrink-0 mt-px">✔</span>
                    <span className="text-[12px] text-gray-600 dark:text-slate-300 leading-[1.7]">{r}</span>
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
              {resumeFixItems.map((suggestion) => (
                <div key={suggestion} className="flex items-start gap-2">
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

          {/* ── Button row ──────────────────────────────────────── */}
          <div className="mt-1 flex flex-col gap-2 border-t border-[#E5E7EB]/80 pt-4 dark:border-[#334155]/80 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex w-full flex-col gap-2 sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center">
              {isOptimized ? (
                <div className="flex w-full items-center gap-1.5 sm:w-auto">
                  <button
                    onClick={onViewOptimized}
                    className={`${secondaryBtn} text-green-600 dark:text-green-500 border-green-200 dark:border-green-800`}
                  >
                    <CheckCircle2 className="w-3 h-3" />View Optimized Resume
                  </button>
                  <button
                    onClick={onDownloadOptimized}
                    title="Download optimized resume"
                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-gray-400 dark:text-slate-500 hover:text-[#2563EB] dark:hover:text-blue-400 hover:border-[#2563EB]/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={onDeleteRequest}
                    title="Delete optimized resume"
                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={fixResumeDisabled ? undefined : () => onOptimize(job.id)}
                  disabled={fixResumeDisabled}
                  title={showResumeFixFallback ? 'No major resume changes suggested for this role.' : undefined}
                  className={fixResumeDisabled ? disabledResumeBtn : blueOutlineBtn}
                >
                  <Wand2 className="w-3 h-3" />Fix Resume For This Job
                </button>
              )}

              <button
                onClick={disableResumeActions ? undefined : () => onInterview(match)}
                disabled={disableResumeActions}
                className={disableResumeActions ? disabledResumeBtn : blueOutlineBtn}
              >
                <Mic className="w-3 h-3" />Prepare For This Interview
              </button>

              <button
                type="button"
                onClick={() => setShowCompanyInfo(true)}
                className={secondaryBtn}
              >
                <Building2 className="w-3 h-3" />Know the Company
              </button>

              <button
                ref={appliedBtnRef}
                onClick={handleToggleApplied}
                disabled={applyingToggle}
                title={isApplied ? 'Remove applied status' : 'Mark as applied'}
                className={isApplied
                  ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-green-200 dark:border-green-800 text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-all disabled:opacity-50'
                  : `${secondaryBtn} disabled:opacity-50`
                }
              >
                {applyingToggle
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : isApplied
                    ? <CheckCircle2 className="w-3 h-3" />
                    : <Circle className="w-3 h-3" />
                }
                {isApplied ? 'Applied' : 'Mark as Applied'}
              </button>
            </div>

            <div className="flex w-full flex-shrink-0 items-center sm:ml-auto sm:w-auto">
              <ApplyButton job={job} onApply={handleApplyCallback} variant="primary" showCompanyButton={false} />
            </div>

            {showRemoveConfirm && confirmPos && createPortal(
              <>
                <div className="fixed inset-0 z-[200]" onClick={() => setShowRemoveConfirm(false)} />
                <div
                  className="fixed z-[201] w-64 bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] shadow-lg p-3.5"
                  style={{ top: confirmPos.top, left: confirmPos.left }}
                >
                  <p className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F1F5F9] mb-1">Remove from Applied Jobs?</p>
                  <p className="text-[12px] text-gray-500 dark:text-slate-400 mb-3 leading-snug">This job will be removed from your Applied Jobs list.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowRemoveConfirm(false)}
                      className="flex-1 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmRemove}
                      className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold transition-all"
                    >
                      Yes, Remove
                    </button>
                  </div>
                </div>
              </>,
              document.body
            )}
          </div>

          {showCompanyInfo && (
            <KnowTheCompanyModal
              job={job}
              onClose={() => setShowCompanyInfo(false)}
            />
          )}
        </div>
    </div>
  )
}
