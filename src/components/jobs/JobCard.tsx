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
import { ApplyButton, sourceLabel } from '@/components/jobs/ApplyButton'

// ── MatchRecord ───────────────────────────────────────────────────────────────

export interface MatchRecord {
  id: string
  ai_score: number
  ai_reasoning: string
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

// ── ImprovementTag ────────────────────────────────────────────────────────────

function ImprovementTag({ label, dim = false }: { label: string; dim?: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-medium cursor-default select-none ${
      dim
        ? 'border-[#E5E7EB] dark:border-[#334155] text-gray-400 dark:text-slate-500 bg-transparent'
        : 'border-[#E5E7EB] dark:border-[#334155] text-gray-500 dark:text-slate-400 bg-[#F8FAFC] dark:bg-[#263549]/40'
    }`}>
      {label}
    </span>
  )
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
  const tierLabel = score >= 80 ? 'Strong Match' : score >= 60 ? 'Good Match' : score >= 20 ? 'Fair Match' : 'Weak'
  const tierColor = score >= 80 ? 'text-green-600 dark:text-green-500' : score >= 60 ? 'text-blue-600 dark:text-blue-400' : score >= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'
  const topPct    = score >= 85 ? 10 : score >= 75 ? 20 : score >= 65 ? 35 : 50

  const prevScoreRef  = useRef(score)
  const countFromRef  = useRef(0)
  if (prevScoreRef.current !== score) {
    countFromRef.current  = prevScoreRef.current
    prevScoreRef.current  = score
  }

  const animated     = useAnimate()
  const displayScore = useCountUp(score, celebrate ? 1800 : 900, 0, countFromRef.current)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[64px] h-[64px] flex items-center justify-center">
        <svg
          width="64" height="64" viewBox="0 0 64 64"
          className="-rotate-90 absolute inset-0"
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
          <div className="text-[19px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-none">{displayScore}</div>
        </div>
      </div>
      <span className={`text-[10px] font-bold ${tierColor} leading-tight text-center`}>{tierLabel}</span>
      <span className="text-[9px] text-gray-400 dark:text-slate-500 text-center leading-tight">Top {topPct}%</span>
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
}) {
  const { job } = match
  const [saved, setSaved]                   = useState(initialSaved)
  const [saving, setSaving]                 = useState(false)
  const [applicationId, setApplicationId]   = useState<string | undefined>(initialApplicationId)
  const [isApplied, setIsApplied]           = useState(initialIsApplied)
  const [applyingToggle, setApplyingToggle] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
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
        body: JSON.stringify({ jobId: job.id, status: 'applied' }),
      })
      if (res.ok) {
        const d = await res.json()
        if (!saved) setSaved(true)
        if (d.application?.id) setApplicationId(d.application.id)
        globalMutate('/api/applications')
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
        body: JSON.stringify({ jobId: job.id, status: 'applied' }),
      })
      if (res.ok) {
        const d = await res.json()
        setIsApplied(true)
        setSaved(true)
        if (d.application?.id) setApplicationId(d.application.id)
        globalMutate('/api/applications')
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
      if (res.ok) { setIsApplied(false); globalMutate('/api/applications') }
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
  const improvementTags = (match.missing_skills?.length ? match.missing_skills : match.matched_skills ?? []).slice(0, 4)
  const extraImprovementTags = Math.max(0, (match.missing_skills?.length ? match.missing_skills.length : match.matched_skills?.length ?? 0) - 4)
  const expLabel = extractExperience(job.description || match.ai_reasoning || '', job.title)
  const jobType  = extractJobType(job.description || '')
  const src      = sourceLabel(job.source)

  const primaryBtn   = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-[11px] font-semibold transition-all hover:shadow-sm active:scale-[0.99]'
  const secondaryBtn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[11px] font-medium text-gray-500 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-all'

  const displayedScore = (!isOptimizing && isOptimized && optimizedScore != null)
    ? optimizedScore : match.ai_score

  void handleSave

  return (
    <div
      className={`animate-fade-in-up group bg-white dark:bg-[#1E293B] rounded-2xl border shadow-sm hover:-translate-y-[2px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out p-4 sm:p-5 ${
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
      <div className="flex gap-4">

        {/* ── MAIN CONTENT ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {isManual && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-[10px] font-semibold text-violet-600 dark:text-violet-400 mb-1.5">
              <User className="w-2.5 h-2.5" />Added by you
            </span>
          )}

          <h3 className="font-bold text-[16px] sm:text-[17px] leading-snug text-[#0F172A] dark:text-[#F1F5F9] mb-1">
            {job.title}
          </h3>

          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-gray-400 dark:text-slate-500 mb-3">
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

          {matchReasons.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-slate-500">
                Why this matches you
              </p>
              <div className="space-y-0.5">
                {matchReasons.map((r: string) => (
                  <div key={r} className="flex items-start gap-1.5">
                    <span className="text-green-500 dark:text-green-400 text-[11px] leading-[1.6] flex-shrink-0 mt-px">✔</span>
                    <span className="text-[12px] text-gray-600 dark:text-slate-300 leading-[1.6]">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {improvementTags.length > 0 && (
            <div className="mb-4">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-slate-500">
                {isOptimized ? 'Resume optimized for this role' : 'Improve match further'}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {improvementTags.map((s) => <ImprovementTag key={s} label={s} />)}
                {extraImprovementTags > 0 && <ImprovementTag label={`+${extraImprovementTags} more`} dim />}
              </div>
            </div>
          )}

          {/* ── Button row ──────────────────────────────────────── */}
          <div className="flex items-center flex-wrap gap-2">
            {isOptimized ? (
              <div className="flex items-center gap-1.5">
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
              <button onClick={() => onOptimize(job.id)} className={primaryBtn}>
                <Wand2 className="w-3 h-3" />Fix Resume For This Job
              </button>
            )}

            <button onClick={() => onInterview(match)} className={primaryBtn}>
              <Mic className="w-3 h-3" />Prepare For This Interview
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
        </div>

        {/* ── ACTION PANEL (right column) ───────────────────────── */}
        <div className="flex flex-col flex-shrink-0 pl-4 border-l border-[#F1F5F9] dark:border-[#334155]" style={{ overflow: 'visible' }}>

          <div className="flex flex-col items-center" style={{ overflow: 'visible' }}>
            <ScoreRing score={displayedScore} celebrate={celebrate} />
          </div>

          <div className="flex flex-col items-center gap-2 mt-auto">
            {src && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#F1F5F9] dark:bg-[#263549] text-gray-400 dark:text-slate-500 border border-[#E5E7EB] dark:border-[#334155] whitespace-nowrap">
                {src}
              </span>
            )}
            <ApplyButton job={job} onApply={handleApplyCallback} variant="outline" />
          </div>

        </div>
      </div>
    </div>
  )
}
