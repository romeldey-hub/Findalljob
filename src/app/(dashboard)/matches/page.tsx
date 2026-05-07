'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useCountUp, useAnimate } from '@/lib/useAnimations'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  Search, MapPin, Building2, Wand2,
  PlusCircle, Loader2, Briefcase, Lightbulb,
  CheckCircle2, RefreshCw,
  Bookmark, BookmarkCheck, Clock, Sparkles,
  SlidersHorizontal, ChevronDown, User, UserCheck, Mic, Lock,
  Download, Trash2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { track } from '@/lib/analytics'
import useSWR, { mutate as globalMutate } from 'swr'
import { PaywallModal } from '@/components/PaywallModal'
import { InterviewModal } from '@/components/InterviewModal'
import { ApplyButton, sourceLabel } from '@/components/jobs/ApplyButton'
import { OptimizeFlow }    from '@/components/resume/OptimizeFlow'
import { ResumePreviewModal } from '@/components/resume/ResumePreviewModal'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'
import { ProgressiveActivity } from '@/components/ProgressiveActivity'
import { useAnalyzeProgress, type StepDefinition } from '@/lib/useAnalyzeProgress'
import { FREE_LIMITS } from '@/lib/limits'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function userFacingError(message: unknown): string {
  const text = typeof message === 'string' ? message : 'Analysis failed.'
  const lower = text.toLowerCase()

  if (lower.includes('credit balance') || lower.includes('plans & billing') || lower.includes('purchase credits')) {
    return 'AI processing is temporarily unavailable because the AI account has no available credits. Please add credits in billing, then try again.'
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return 'AI processing is busy right now. Please wait a moment and try again.'
  }
  return text.replace(/\s+/g, ' ').slice(0, 220)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchRecord {
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

interface FilterState {
  minScore: number
  jobType: string
  experience: string
  location: string
  datePosted: string
}

const DEFAULT_FILTERS: FilterState = { minScore: 0, jobType: 'Any', experience: 'Any', location: '', datePosted: 'Any time' }

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

function recruiterReasonFromSkill(skill: string) {
  return `Strong alignment with ${skill}`
}

const NEGATIVE_REASON_PATTERN = /\b(missing|gap|gaps|lacks?|weak|limited|preferred|required|needs?|should|could improve|without|not enough|no experience)\b/i

// ── ScoreRing ─────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r      = 28
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ

  const ringColor = score >= 80 ? '#16A34A' : score >= 60 ? '#2563EB' : score >= 20 ? '#D97706' : '#9CA3AF'
  const tierLabel = score >= 80 ? 'Strong Match' : score >= 60 ? 'Good Match' : score >= 20 ? 'Fair Match' : 'Weak'
  const tierColor = score >= 80 ? 'text-green-600 dark:text-green-500' : score >= 60 ? 'text-blue-600 dark:text-blue-400' : score >= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'
  const topPct    = score >= 85 ? 10 : score >= 75 ? 20 : score >= 65 ? 35 : 50

  const animated     = useAnimate()
  const displayScore = useCountUp(score, 900)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[64px] h-[64px] flex items-center justify-center">
        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 absolute inset-0">
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
        <div className="relative z-10 text-center">
          <div className="text-[19px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-none">{displayScore}</div>
        </div>
      </div>
      <span className={`text-[10px] font-bold ${tierColor} leading-tight text-center`}>{tierLabel}</span>
      <span className="text-[9px] text-gray-400 dark:text-slate-500 text-center leading-tight">Top {topPct}%</span>
    </div>
  )
}

// ── Experience extractor ──────────────────────────────────────────────────────

function extractExperience(description: string, title?: string): string | null {
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

// ── Work-mode / job-type extractors ──────────────────────────────────────────

function extractWorkMode(text: string): string {
  const t = text.toLowerCase()
  if (/\bremote\b/.test(t)) return 'Remote'
  if (/\bhybrid\b/.test(t)) return 'Hybrid'
  if (/\bon[-\s]?site\b/.test(t)) return 'On-site'
  return ''
}

function extractJobType(text: string): string {
  const t = text.toLowerCase()
  if (/\bcontract\b|\bfreelance\b|\bcontractor\b/.test(t)) return 'Contract'
  if (/\bpart[-\s]?time\b/.test(t)) return 'Part-time'
  return 'Full-time'
}

function extractExpMin(expLabel: string | null): number {
  if (!expLabel) return -1
  const m = expLabel.match(/(\d+)/)
  return m ? parseInt(m[1]) : -1
}

// ── Filter logic ──────────────────────────────────────────────────────────────

function applyFilters(matches: MatchRecord[], filters: FilterState): MatchRecord[] {
  return matches.filter((m) => {
    if (m.ai_score < filters.minScore) return false

    if (filters.location.trim() &&
        !m.job.location.toLowerCase().includes(filters.location.toLowerCase().trim())) return false

    if (filters.experience !== 'Any') {
      const expLabel = extractExperience(m.job.description || m.ai_reasoning || '', m.job.title)
      const expMin   = extractExpMin(expLabel)
      if (filters.experience === '0–5 years'  && (expMin === -1 || expMin >= 5))               return false
      if (filters.experience === '5–10 years' && (expMin === -1 || expMin < 5 || expMin >= 10)) return false
      if (filters.experience === '10+ years'  && (expMin === -1 || expMin < 10))                return false
    }

    if (filters.jobType !== 'Any') {
      const text     = (m.job.description || '') + ' ' + (m.job.location || '') + ' ' + (m.ai_reasoning || '')
      const workMode = extractWorkMode(text)
      const jobType  = extractJobType(text)
      if (filters.jobType === 'Remote'    && workMode !== 'Remote')    return false
      if (filters.jobType === 'Hybrid'    && workMode !== 'Hybrid')    return false
      if (filters.jobType === 'Full-time' && jobType  !== 'Full-time') return false
      if (filters.jobType === 'Contract'  && jobType  !== 'Contract')  return false
    }

    return true
  })
}

function formatPostedDate(dateStr?: string | null): string {
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

// ── JobCard ───────────────────────────────────────────────────────────────────

function JobCard({
  match, onOptimize, onInterview,
  initialSaved = false, initialApplicationId,
  isOptimized = false, isManual = false, isNew = false,
  animIndex = 0,
  optimizedResumeId,
  onViewOptimized,
  onDeleteOptimized,
}: {
  match: MatchRecord
  onOptimize: (id: string) => void
  onInterview: (match: MatchRecord) => void
  initialSaved?: boolean
  initialApplicationId?: string
  isOptimized?: boolean
  isManual?: boolean
  isNew?: boolean
  animIndex?: number
  optimizedResumeId?: string
  onViewOptimized?: () => void
  onDeleteOptimized?: (id: string) => Promise<void>
}) {
  const { job } = match
  const [saved, setSaved]                 = useState(initialSaved)
  const [saving, setSaving]               = useState(false)
  const [applicationId, setApplicationId] = useState<string | undefined>(initialApplicationId)
  const [deleting, setDeleting]           = useState(false)

  async function handleDeleteClick() {
    if (!optimizedResumeId || deleting) return
    setDeleting(true)
    try {
      await onDeleteOptimized?.(optimizedResumeId)
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setSaved(initialSaved)
      setApplicationId(initialApplicationId)
    }, 0)
    return () => clearTimeout(t)
  }, [initialSaved, initialApplicationId])

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

  // Confidence first: keep this section positive and recruiter-style.
  const matchReasons = (match.match_reasons?.length
    ? match.match_reasons
    : (match.matched_skills ?? []).map(recruiterReasonFromSkill)
  )
    .filter((reason) => reason && !NEGATIVE_REASON_PATTERN.test(reason))
    .slice(0, 4)
  // Optimization signals: softer tags connected to the resume-fix action.
  const improvementTags = (match.missing_skills?.length ? match.missing_skills : match.matched_skills ?? []).slice(0, 4)
  const extraImprovementTags = Math.max(0, (match.missing_skills?.length ? match.missing_skills.length : match.matched_skills?.length ?? 0) - 4)
  const expLabel       = extractExperience(job.description || match.ai_reasoning || '', job.title)
  const jobType        = extractJobType(job.description || '')
  const src            = sourceLabel(job.source)

  const primaryBtn   = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-[11px] font-semibold transition-all hover:shadow-sm active:scale-[0.99]'
  const secondaryBtn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[11px] font-medium text-gray-500 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-all'

  return (
    <div
      className={`animate-fade-in-up group bg-white dark:bg-[#1E293B] rounded-2xl border shadow-sm hover:-translate-y-[2px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out p-4 sm:p-5 ${
        isNew
          ? 'border-[#2563EB] ring-2 ring-[#2563EB]/15 dark:ring-[#2563EB]/20'
          : 'border-[#E5E7EB] dark:border-[#334155]'
      }`}
      style={{ animationDelay: `${animIndex * 60}ms` }}
    >
      <div className="flex gap-4">

        {/* ── MAIN CONTENT ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* "Added by you" badge */}
          {isManual && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-[10px] font-semibold text-violet-600 dark:text-violet-400 mb-1.5">
              <User className="w-2.5 h-2.5" />Added by you
            </span>
          )}

          {/* Job title */}
          <h3 className="font-bold text-[16px] sm:text-[17px] leading-snug text-[#0F172A] dark:text-[#F1F5F9] mb-1">
            {job.title}
          </h3>

          {/* Meta row */}
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

          {/* ── Why this matches you — recruiter-style narrative bullets ── */}
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

          {/* ── Improve match further — softer optimization signals ── */}
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
            {/* Primary: Fix Resume For This Job / View Optimized Resume */}
            {isOptimized ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onViewOptimized}
                  className={`${secondaryBtn} text-green-600 dark:text-green-500 border-green-200 dark:border-green-800`}
                >
                  <CheckCircle2 className="w-3 h-3" />View Optimized Resume
                </button>
                {optimizedResumeId && (
                  <>
                    <button
                      onClick={onViewOptimized}
                      title="Download optimized resume"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-gray-400 dark:text-slate-500 hover:text-[#2563EB] dark:hover:text-blue-400 hover:border-[#2563EB]/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    <button
                      onClick={handleDeleteClick}
                      disabled={deleting}
                      title="Delete optimized resume"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button onClick={() => onOptimize(job.id)} className={primaryBtn}>
                <Wand2 className="w-3 h-3" />Fix Resume For This Job
              </button>
            )}

            {/* Primary: interview preparation */}
            <button onClick={() => onInterview(match)} className={primaryBtn}>
              <Mic className="w-3 h-3" />Prepare For This Interview
            </button>
          </div>
        </div>

        {/* ── ACTION PANEL (right column) ───────────────────────── */}
        <div className="flex flex-col flex-shrink-0 pl-4 border-l border-[#F1F5F9] dark:border-[#334155]">

          {/* Bookmark — top right of panel */}
          <div className="flex justify-end mb-2">
            <button
              onClick={handleSave}
              disabled={saving}
              title={saved ? 'Remove bookmark' : 'Save job'}
              className="text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 transition-colors disabled:opacity-50"
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : saved
                ? <BookmarkCheck className="w-3.5 h-3.5 text-[#2563EB]" />
                : <Bookmark className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Score unit — top aligned */}
          <div className="flex flex-col items-center">
            <ScoreRing score={match.ai_score} />
          </div>

          {/* Source + CTA — anchored to bottom */}
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

// ── Paste Job Dialog ──────────────────────────────────────────────────────────

function PasteJobDialog({ onJobAdded }: { onJobAdded: (match: MatchRecord) => void }) {
  const [open, setOpen]       = useState(false)
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)

  const isUrl = /^https?:\/\//i.test(input.trim())

  async function handleSubmit() {
    const trimmed = input.trim()
    if (!isUrl && trimmed.length < 50) { toast.error('Please paste the full job description (at least 50 characters)'); return }
    if (isUrl && trimmed.length < 10)  { toast.error('Please enter a valid job URL'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/jobs/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to add job'); return }
      toast.success('Job added and scored!')
      setOpen(false)
      setInput('')
      onJobAdded(data.match)
    } catch { toast.error('Failed to add job') }
    finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-[#1E293B] transition-colors cursor-pointer">
        <PlusCircle className="w-3.5 h-3.5" />Paste Job Description
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add a Job Manually</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <p className="text-sm text-gray-500">Paste a job description or drop in a job URL — AI will score your fit instantly.</p>
          <textarea
            className="w-full h-44 p-3 text-sm border border-[#E5E7EB] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            placeholder="Paste the full job description, or enter a job URL (https://…)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {isUrl && (
            <p className="text-[11px] text-[#2563EB] -mt-1">URL detected — the page will be fetched and parsed automatically.</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing…</> : 'Analyze & Add Job'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Filter Panel ──────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  onChange,
  onClear,
  className = '',
}: {
  filters: FilterState
  onChange: (f: FilterState) => void
  onClear: () => void
  className?: string
}) {
  const EXP_OPTIONS = ['Any', '0–5 years', '5–10 years', '10+ years']
  const JOB_TYPES   = ['Any', 'Full-time', 'Contract', 'Remote', 'Hybrid']

  return (
    <aside className={className || 'w-60 flex-shrink-0'}>
      <div className="xl:sticky xl:top-6 bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5 space-y-6">
        <h3 className="font-bold text-[13px] text-[#0F172A] dark:text-[#F1F5F9] tracking-tight">Refine Results</h3>

        {/* Experience */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2.5">Experience Level</p>
          <div className="space-y-2">
            {EXP_OPTIONS.map((opt) => (
              <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filters.experience === opt}
                  onChange={() => onChange({ ...filters, experience: opt })}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-slate-600 accent-[#0F172A] dark:accent-[#2563EB] cursor-pointer"
                />
                <span className="text-[13px] text-gray-600 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{opt}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Job Type */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2.5">Job Type</p>
          <div className="space-y-2">
            {JOB_TYPES.map((opt) => (
              <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filters.jobType === opt}
                  onChange={() => onChange({ ...filters, jobType: opt })}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-slate-600 accent-[#0F172A] dark:accent-[#2563EB] cursor-pointer"
                />
                <span className="text-[13px] text-gray-600 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{opt}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2.5">Location</p>
          <div className="relative">
            <MapPin className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="e.g. Bangalore"
              value={filters.location}
              onChange={(e) => onChange({ ...filters, location: e.target.value })}
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#263549] text-gray-600 dark:text-slate-300 placeholder:text-gray-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0F172A]/10 dark:focus:ring-[#2563EB]/20 focus:border-gray-400 dark:focus:border-[#2563EB]"
            />
          </div>
        </div>

        {/* Date Posted */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2.5">Date Posted</p>
          <div className="relative">
            <select
              value={filters.datePosted}
              onChange={(e) => onChange({ ...filters, datePosted: e.target.value })}
              className="w-full text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg px-3 py-2 appearance-none bg-white dark:bg-[#263549] text-gray-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0F172A]/10 dark:focus:ring-[#2563EB]/20 focus:border-gray-400 dark:focus:border-[#2563EB] cursor-pointer"
            >
              <option>Any time</option>
              <option>Last 24 hours</option>
              <option>Last week</option>
              <option>Last month</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Min Score */}
        <div>
          <div className="flex justify-between items-center mb-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500">Min Match Score</p>
            <span className="text-[12px] font-bold text-[#0F172A] dark:text-[#F1F5F9]">{filters.minScore}%</span>
          </div>
          <input
            type="range"
            min={0} max={100} step={5}
            value={filters.minScore}
            onChange={(e) => onChange({ ...filters, minScore: Number(e.target.value) })}
            className="w-full accent-[#0F172A] dark:accent-[#2563EB] h-1.5"
          />
          <div className="flex justify-between text-[10px] text-gray-300 dark:text-slate-600 mt-1.5">
            <span>0%</span><span>100%</span>
          </div>
        </div>

        {/* Clear */}
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-[#DC2626] hover:text-red-700 dark:hover:text-red-400 transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />Clear Filters
        </button>
      </div>
    </aside>
  )
}

// ── CV Suggestions Panel ──────────────────────────────────────────────────────

function CvSuggestions({ suggestions }: { suggestions: string[] }) {
  if (!suggestions.length) return null
  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-[#1E3A5F] flex items-center justify-center">
          <Lightbulb className="w-3.5 h-3.5 text-[#2563EB]" />
        </div>
        <h3 className="font-bold text-[13px] text-[#0F172A] dark:text-[#F1F5F9]">How to improve your chances</h3>
      </div>
      <ul className="space-y-2.5">
        {suggestions.map((s, i) => (
          <li key={i} className="flex gap-3 text-[13px]">
            <span className="w-5 h-5 rounded-full bg-[#F1F5F9] dark:bg-[#263549] flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-slate-400 shrink-0 mt-0.5">{i + 1}</span>
            <span className="text-gray-600 dark:text-slate-400 leading-relaxed">{s}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Analyze progress configuration (defined outside component — never recreated) ──

const REANALYZE_STEP_DEFS: StepDefinition[] = [
  { label: 'Reading your latest resume...',   defaultDescription: 'Checking the resume saved to your profile.' },
  { label: 'Rebuilding search strategy...',   defaultDescription: 'Building focused queries for your background.' },
  { label: 'Searching job sources...',        defaultDescription: 'Searching multiple job sources for matches.' },
  { label: 'Reviewing matched listings...',   defaultDescription: 'Filtering the most relevant opportunities.' },
  { label: 'Scoring with AI...',              defaultDescription: 'AI is ranking jobs against your profile.' },
  { label: 'Preparing your results...',       defaultDescription: 'Saving and organising your top matches.' },
]

const REANALYZE_STEP_MAP: Record<string, number> = {
  resume_loaded:  0,
  profile_parsed: 0,
  strategy_ready: 1,
  jobs_fetching:  2,
  pool_selected:  3,
  ai_ranking:     4,
  matches_saved:  5,
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MatchesPage() {
  const router = useRouter()

  const [title, setTitle]             = useState('')
  const [location, setLocation]       = useState('')
  const [searchOpen, setSearchOpen]   = useState(false)
  const [searching, setSearching]     = useState(false)
  const [filters, setFilters]         = useState<FilterState>(DEFAULT_FILTERS)
  const [showPaywall, setShowPaywall] = useState(false)
  const [sortKey, setSortKey]         = useState<'score' | 'date'>('score')
  const [interviewMatch, setInterviewMatch] = useState<MatchRecord | null>(null)
  const [optimizeJobId, setOptimizeJobId]         = useState<string | null>(null)
  const [viewOptimizedJobId, setViewOptimizedJobId] = useState<string | null>(null)
  const [tierFilter, setTierFilter]         = useState<'all' | 'high' | 'medium' | 'stretch'>('all')

  // mode determines which list is rendered — never both simultaneously
  const [mode, setMode]                 = useState<'ai' | 'manual'>('ai')
  // null = not yet set, fall back to SWR ai jobs
  const [aiJobs, setAiJobs]             = useState<MatchRecord[] | null>(null)
  const [manualJobs, setManualJobs]     = useState<MatchRecord[]>([])
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null)
  const [suggestions, setSuggestions]       = useState<string[]>([])
  const [detectedCountry, setDetectedCountry] = useState<string>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('detectedCountry') ?? '') : ''
  )
  const [detectedCity, setDetectedCity] = useState<string>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('detectedCity') ?? '') : ''
  )
  const [analyzing, setAnalyzing]       = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [searchMessage, setSearchMessage] = useState('')
  const [searchHadError, setSearchHadError] = useState(false)
  const [searchStage, setSearchStage]       = useState<'primary' | 'fallback' | null>(null)
  const autoTriggered = useRef(false)
  const aiSectionRef  = useRef<HTMLDivElement>(null)

  const { activitySteps, onSSEEvent, reset: resetProgress, stop: stopProgress } =
    useAnalyzeProgress({ stepDefs: REANALYZE_STEP_DEFS, stepMap: REANALYZE_STEP_MAP })

  const { data, error: swrError, mutate } = useSWR('/api/jobs/match', fetcher)
  const { data: appsData }                = useSWR('/api/applications', fetcher)
  const { data: optimizedData }           = useSWR('/api/resume/optimize', fetcher)
  const { data: profileData }             = useSWR('/api/profile', fetcher)

  const savedJobIds = useMemo(() => {
    const ids = new Set<string>()
    for (const app of (appsData?.applications ?? [])) {
      if (app.job?.id) ids.add(app.job.id)
    }
    return ids
  }, [appsData])

  const savedJobToAppId = useMemo(() => {
    const map = new Map<string, string>()
    for (const app of (appsData?.applications ?? [])) {
      if (app.job?.id && app.id) map.set(app.job.id, app.id)
    }
    return map
  }, [appsData])

  const optimizedResumesByJobId = useMemo(() => {
    const map = new Map<string, { id: string; data: OptimizedResumeData }>()
    for (const r of (optimizedData?.resumes ?? [])) {
      if (!r.job_id || !r.optimized_text) continue
      try {
        map.set(r.job_id, { id: r.id, data: JSON.parse(r.optimized_text) as OptimizedResumeData })
      } catch { /* malformed — skip */ }
    }
    return map
  }, [optimizedData])

  const optimizedJobIds = useMemo(() => new Set(optimizedResumesByJobId.keys()), [optimizedResumesByJobId])

  // AI jobs from SWR (non-manual source), used as fallback when aiJobs is null
  const savedAiJobs: MatchRecord[] = useMemo(
    () => (data?.matches ?? []).filter((m: MatchRecord) => m.job?.source !== 'manual'),
    [data]
  )

  const hasResume: boolean = data?.hasResume ?? false
  const dataLoaded         = data !== undefined

  // Resolved display lists — only one is rendered at a time based on mode
  const displayAiJobs: MatchRecord[]  = aiJobs !== null ? aiJobs : savedAiJobs
  const jobsToDisplay: MatchRecord[]  = mode === 'ai' ? displayAiJobs : manualJobs
  const displaySuggestions            = suggestions.length > 0 ? suggestions : (mode === 'ai' ? (data?.cvSuggestions ?? []) : [])
  const filteredJobs                  = applyFilters(jobsToDisplay, filters)
  const sortedJobs                    = filteredJobs.slice().sort((a, b) => {
    if (sortKey === 'date') {
      const da = new Date(a.job.created_at ?? 0).getTime()
      const db = new Date(b.job.created_at ?? 0).getTime()
      return db - da
    }
    return b.ai_score - a.ai_score
  })
  const tieredJobs = tierFilter === 'all' ? sortedJobs : sortedJobs.filter((m) => {
    if (tierFilter === 'high')    return m.ai_score >= 80
    if (tierFilter === 'medium')  return m.ai_score >= 60 && m.ai_score < 80
    if (tierFilter === 'stretch') return m.ai_score < 60
    return true
  })
  const tierCounts = {
    high:    sortedJobs.filter((m) => m.ai_score >= 80).length,
    medium:  sortedJobs.filter((m) => m.ai_score >= 60 && m.ai_score < 80).length,
    stretch: sortedJobs.filter((m) => m.ai_score < 60).length,
  }
  const isLoading                     = analyzing || searching

  // Auto-trigger on first load when user has a resume but no AI matches yet.
  // Skip if an analysis was completed in the last 10 minutes (localStorage guard)
  // to prevent double-analyze when navigating here right after the resume page runs one.
  useEffect(() => {
    if (!data || autoTriggered.current || analyzing) return
    const hasAiMatches = savedAiJobs.length > 0 || aiJobs !== null
    if (!hasAiMatches && hasResume) {
      const lastAnalyzed = Number(localStorage.getItem('lastAnalyzedAt') ?? 0)
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000
      if (lastAnalyzed > tenMinutesAgo) return   // recently analyzed — skip auto-trigger
      autoTriggered.current = true
      triggerAnalyze(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  async function triggerAnalyze(reanalyze: boolean) {
    // Block free users who have exhausted their re-analyze quota
    const isPro = profileData?.plan === 'pro'
    if (!isPro && (profileData?.ai_reanalyze_count ?? 0) >= FREE_LIMITS.aiReanalyze) {
      setShowPaywall(true)
      return
    }

    track.aiAnalyzeClick()
    setMode('ai')
    setAiJobs([])
    setSuggestions([])
    setAnalyzing(true)
    setAnalyzeError('')
    setTierFilter('all')
    resetProgress()

    let matchCount    = 0
    let cvSuggestions: string[] = []
    let hadError      = false
    let errorMessage  = ''
    let noJobsMessage = ''

    try {
      const res = await fetch('/api/resume/analyze', { method: 'POST' })

      // Early JSON errors (401, 404, 500 before the stream starts)
      if (!res.ok) {
        const data    = await res.json().catch(() => ({}))
        const message = userFacingError(data.error ?? 'Analysis failed.')
        localStorage.setItem('lastAnalyzedAt', String(Date.now()))
        setAnalyzeError(message)
        toast.error(message)
        stopProgress()
        return
      }

      if (!res.body) throw new Error('No response stream')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''

          for (const part of parts) {
            for (const line of part.split('\n')) {
              if (!line.startsWith('data: ')) continue
              try {
                const event = JSON.parse(line.slice(6)) as Record<string, unknown>
                onSSEEvent(event)

                if (event.done) {
                  matchCount    = (event.matchCount as number)  ?? 0
                  cvSuggestions = (event.cvSuggestions as string[]) ?? []
                  if (event.message) noJobsMessage = event.message as string
                  if (event.detectedCountry) {
                    const country = event.detectedCountry as string
                    setDetectedCountry(country)
                    localStorage.setItem('detectedCountry', country)
                  }
                  if (event.detectedCity) {
                    const city = event.detectedCity as string
                    setDetectedCity(city)
                    localStorage.setItem('detectedCity', city)
                  }
                }
                if (event.error) {
                  hadError     = true
                  errorMessage = userFacingError(event.error as string)
                }
              } catch { /* malformed SSE line — skip */ }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      if (hadError) {
        localStorage.setItem('lastAnalyzedAt', String(Date.now()))
        setAnalyzeError(errorMessage)
        toast.error(errorMessage)
        return
      }

      if (matchCount === 0) {
        setAnalyzeError(noJobsMessage || 'No jobs found. Try the search form.')
        return
      }

      localStorage.setItem('lastAnalyzedAt', String(Date.now()))
      toast.success(`Found ${matchCount} AI-ranked matches!`)
      const fresh    = await mutate()
      const allFresh: MatchRecord[] = fresh?.matches ?? []
      const newAi    = allFresh
        .filter((m) => m.job?.source !== 'manual')
        .filter((m) => !reanalyze || (m.ai_score >= 40 && m.ai_score <= 100))
      setAiJobs(newAi)
      if (cvSuggestions.length > 0) setSuggestions(cvSuggestions)
      // Refresh profile so ai_reanalyze_count reflects the increment from the server
      void globalMutate('/api/profile')
    } catch {
      setAnalyzeError('Analysis failed. Check the terminal for errors.')
      stopProgress()
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !location.trim()) return

    // Block free users who have exhausted their search quota
    const isPro = profileData?.plan === 'pro'
    if (!isPro && (profileData?.job_search_count ?? 0) >= FREE_LIMITS.jobSearch) {
      setShowPaywall(true)
      return
    }

    track.jobSearch(`${title} ${location}`.trim())
    setSearching(true)
    setSuggestions([])
    setSearchMessage('')
    setSearchHadError(false)
    setSearchStage('primary')

    try {
      // ── Phase 1: Adzuna + JSearch ────────────────────────────────────────
      const doSearch = async (fallback: boolean) => {
        const res    = await fetch('/api/jobs/search', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title: title.trim(), location: location.trim(), fallback }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error ?? 'Search failed')
        return result
      }

      let result = await doSearch(false)

      // ── Phase 2: Apify fallback when primary returns too few results ──────
      // Threshold matches the analyze route (< 5) so both flows behave identically.
      if ((result.matches ?? []).length < 5) {
        setSearchStage('fallback')
        const apifyResult = await doSearch(true)
        // Use Apify result only if it found more matches than primary
        if ((apifyResult.matches ?? []).length > (result.matches ?? []).length) {
          result = apifyResult
        }
      }

      const matches: MatchRecord[] = result.matches ?? []
      setManualJobs(matches)
      setSuggestions(result.cvSuggestions ?? [])
      setSearchHadError((result.errors ?? []).length > 0 && matches.length === 0)
      setSearchMessage(result.message ?? '')
      setMode('manual')
      setSearchOpen(false)
      aiSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

      if (matches.length === 0) {
        // Empty state body handles the message — no duplicate toast
      } else if (result.noResume) {
        toast.info(`Found ${result.jobCount} jobs — upload a resume for AI scoring.`)
      } else {
        const source = result.sourcesUsed?.includes('Apify') ? ' (via expanded search)' : ''
        toast.success(`${matches.length} AI-ranked matches found${source}!`)
        setTimeout(() => mutate(), 2000)
      }
      // Refresh profile so job_search_count reflects the increment from the server
      void globalMutate('/api/profile')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed. Please try again.')
    } finally {
      setSearching(false)
      setSearchStage(null)
    }
  }

  function handleManualJobAdded(match: MatchRecord) {
    setMode('manual')
    setManualJobs([match])
    setNewlyAddedId(match.id)
    setTimeout(() => setNewlyAddedId(null), 4000)
  }

  function handleOptimize(jobId: string) {
    const isPro = profileData?.plan === 'pro'
    if (!isPro) { setShowPaywall(true); return }
    setOptimizeJobId(jobId)
  }

  function handleInterview(match: MatchRecord) {
    setInterviewMatch(match)
  }

  async function handleDeleteOptimized(id: string) {
    const res = await fetch(`/api/resume/optimize?id=${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Failed to delete optimized resume')
      throw new Error('Delete failed')
    }
    toast.success('Optimized resume removed')
    globalMutate('/api/resume/optimize')
  }

  // activitySteps comes from useAnalyzeProgress — driven by real SSE events + time gating

  const searchesUsed       = profileData?.job_search_count ?? 0
  const searchLimitReached = profileData !== undefined && profileData?.plan !== 'pro' && searchesUsed >= FREE_LIMITS.jobSearch

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2 leading-tight">
          Matched Jobs
          <Sparkles className="w-4 h-4 text-amber-400" />
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">AI-ranked jobs based on your resume.</p>
      </div>

      {/* ── Search bar (collapsible) ─────────────────────────────── */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm overflow-hidden">

        {/* Toggle header — always visible */}
        <button
          type="button"
          onClick={() => { if (searchLimitReached) { setShowPaywall(true); return } setSearchOpen((o) => !o) }}
          className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${searchLimitReached ? 'cursor-default' : 'hover:bg-gray-50 dark:hover:bg-[#263549]'}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {searchLimitReached
              ? <Lock className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
              : <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />}
            <span className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] truncate">
              {searchLimitReached
                ? 'Search limit reached'
                : title.trim() || location.trim()
                ? [title.trim(), location.trim()].filter(Boolean).join(' · ')
                : 'Search & filter jobs'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {!searchLimitReached && profileData?.plan !== 'pro' && profileData !== undefined && (
              <span className="text-[10px] text-gray-400 dark:text-slate-500 whitespace-nowrap">
                {Math.max(0, FREE_LIMITS.jobSearch - searchesUsed)}/{FREE_LIMITS.jobSearch} searches left
              </span>
            )}
            {searchLimitReached && (
              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 underline whitespace-nowrap">
                Upgrade to search
              </span>
            )}
            {!searchLimitReached && (
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-slate-500 transition-transform duration-200 ${searchOpen ? 'rotate-180' : ''}`}
              />
            )}
          </div>
        </button>

        {/* Expandable form */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${searchOpen ? 'max-h-[350px]' : 'max-h-0'}`}>
          <form
            onSubmit={handleSearch}
            className="flex flex-wrap gap-3 p-4 border-t border-[#E5E7EB] dark:border-[#334155]"
          >
            <div className="w-full sm:flex-1 sm:min-w-48">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 mb-1.5">Job Title / Keyword</p>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="e.g. Senior Software Engineer"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="pl-8 h-10 rounded-xl border-[#E5E7EB] text-[13px] focus-visible:ring-[#2563EB]/20"
                />
              </div>
            </div>
            <div className="w-full sm:flex-1 sm:min-w-48">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 mb-1.5">Location</p>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="e.g. Bangalore, India"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-8 h-10 rounded-xl border-[#E5E7EB] text-[13px] focus-visible:ring-[#2563EB]/20"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-2.5 w-full lg:w-auto">
              <button
                type="submit"
                disabled={searching || !title.trim() || !location.trim() || searchLimitReached}
                className="flex items-center justify-center gap-2 px-5 h-10 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white text-[13px] font-bold transition-all hover:scale-[1.02] active:scale-100 disabled:opacity-40 shadow-sm"
              >
                {searching ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Searching…</> : <><Search className="w-3.5 h-3.5" />Find &amp; Match Jobs</>}
              </button>
              <PasteJobDialog onJobAdded={handleManualJobAdded} />
            </div>
          </form>
        </div>
      </div>

      {/* ── Error state ──────────────────────────────────────────── */}
      {analyzeError && !analyzing && (
        <div className="flex items-center justify-between gap-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <p className="text-[13px] text-[#DC2626]">{analyzeError}</p>
          <button
            onClick={() => { autoTriggered.current = false; triggerAnalyze(false) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-[12px] font-semibold text-[#DC2626] hover:bg-red-100 transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3 h-3" />Retry
          </button>
        </div>
      )}

      {swrError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
          <p className="text-[13px] text-[#DC2626]">Failed to load saved matches.</p>
        </div>
      )}

      {/* ── Main: job list + filter panel ────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-5 items-start">

        {/* ── Single results section — renders AI or Manual, never both ── */}
        <div className="flex-1 min-w-0 space-y-4" ref={aiSectionRef}>

          <details className="xl:hidden rounded-2xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#1E293B] shadow-sm overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-bold text-[#0F172A] dark:text-[#F1F5F9]">
              Refine Results
              <SlidersHorizontal className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            </summary>
            <div className="border-t border-[#F1F5F9] dark:border-[#334155]">
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                onClear={() => setFilters(DEFAULT_FILTERS)}
                className="w-full"
              />
            </div>
          </details>

          {/* Section header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-bold text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-1.5">
                {mode === 'ai'
                  ? <><span>Matched Jobs</span><Sparkles className="w-3.5 h-3.5 text-amber-400" /></>
                  : <><span>Search Results</span><Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" /></>}
              </h2>
              {sortedJobs.length > 0 && (
                <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 bg-[#F1F5F9] dark:bg-[#263549] px-2 py-0.5 rounded-full">
                  {sortedJobs.length}
                </span>
              )}
              {analyzing && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />Updating…
                </span>
              )}
              {aiJobs !== null && aiJobs.length > 0 && mode === 'ai' && !searching && !analyzing && (
                <span className="text-[11px] font-bold text-[#16A34A] bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded-full">
                  Fresh results
                </span>
              )}
            </div>

            {/* Re-analyze button — available in both modes */}
            {displayAiJobs.length > 0 && (() => {
              const isPro              = profileData?.plan === 'pro'
              const reanalyzeUsed      = profileData?.ai_reanalyze_count ?? 0
              const reanalyzeLimitHit  = !isPro && reanalyzeUsed >= FREE_LIMITS.aiReanalyze
              const disabled           = analyzing || searching || reanalyzeLimitHit

              return (
                <div className="flex flex-col items-end gap-0.5">
                  <button
                    onClick={() => { autoTriggered.current = false; triggerAnalyze(true) }}
                    disabled={disabled}
                    title={reanalyzeLimitHit ? `You've used all ${FREE_LIMITS.aiReanalyze} free re-analyses` : undefined}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-all ${
                      disabled
                        ? 'border-[#E5E7EB] dark:border-[#334155] text-gray-300 dark:text-slate-600 cursor-not-allowed'
                        : 'border-[#E5E7EB] dark:border-[#334155] text-gray-500 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-slate-500'
                    }`}
                  >
                    {analyzing
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Re-analyzing…</>
                      : <><RefreshCw className="w-3 h-3" />Re-analyze by AI</>}
                  </button>
                  {!isPro && !reanalyzeLimitHit && (
                    <span className="text-[10px] text-gray-400 dark:text-slate-500">
                      {FREE_LIMITS.aiReanalyze - reanalyzeUsed}/{FREE_LIMITS.aiReanalyze} left
                    </span>
                  )}
                  {reanalyzeLimitHit && (
                    <button
                      onClick={() => setShowPaywall(true)}
                      className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Limit reached · Upgrade
                    </button>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Mode label — source attribution (manual mode only) */}
          {mode === 'manual' && (
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 dark:text-slate-500 -mt-1">
              <User className="w-3 h-3" />Showing manual search results
              {displayAiJobs.length > 0 && (
                <button
                  onClick={() => setMode('ai')}
                  className="ml-1 text-[#2563EB] dark:text-blue-400 hover:underline font-semibold"
                >
                  · Switch to AI results
                </button>
              )}
            </p>
          )}

          {/* Tier tabs + inline location context — visible when there are jobs to show */}
          {sortedJobs.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { id: 'all',     label: 'All',              count: sortedJobs.length,   dot: '' },
                { id: 'high',    label: 'High-probability', count: tierCounts.high,     dot: 'bg-green-500' },
                { id: 'medium',  label: 'Medium',           count: tierCounts.medium,   dot: 'bg-blue-500' },
                { id: 'stretch', label: 'Stretch',          count: tierCounts.stretch,  dot: 'bg-amber-500' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTierFilter(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-all ${
                    tierFilter === tab.id
                      ? 'bg-[#0F172A] dark:bg-[#2563EB] text-white border-transparent'
                      : 'bg-white dark:bg-[#1E293B] text-gray-500 dark:text-slate-400 border-[#E5E7EB] dark:border-[#334155] hover:border-gray-300 dark:hover:border-slate-500'
                  }`}
                >
                  {tab.dot && <span className={`w-1.5 h-1.5 rounded-full ${tab.dot} flex-shrink-0`} />}
                  {tab.label}
                  <span className={`text-[10px] font-bold px-1 py-0.5 rounded-sm ${
                    tierFilter === tab.id ? 'bg-white/20' : 'bg-[#F1F5F9] dark:bg-[#263549] text-gray-400 dark:text-slate-500'
                  }`}>{tab.count}</span>
                </button>
              ))}

              {/* Location context — right-aligned on desktop, wraps below filters on mobile */}
              {detectedCountry && (
                <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-400 dark:text-slate-500 font-medium">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  Showing jobs in{' '}
                  <span className="font-semibold text-gray-500 dark:text-slate-400">{detectedCountry}</span>
                  {detectedCity && (
                    <> · Resume location:{' '}
                      <span className="font-semibold text-gray-500 dark:text-slate-400">{detectedCity}</span>
                    </>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Count bar — stays visible while loading */}
          {sortedJobs.length > 0 && (
            <div className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-slate-500">
              <Clock className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
              <span className="font-bold text-[#0F172A] dark:text-[#F1F5F9]">{tieredJobs.length} matches</span>
              <span className="text-gray-200 dark:text-slate-700">·</span>
              <div className="relative flex items-center gap-1">
                <span className="text-[12px] text-gray-400 dark:text-slate-500">Sort by:</span>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as 'score' | 'date')}
                  className="appearance-none bg-transparent text-[12px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] cursor-pointer outline-none pr-4 hover:text-[#2563EB] dark:hover:text-blue-400 transition-colors"
                >
                  <option value="score">Best Match</option>
                  <option value="date">Latest Jobs</option>
                </select>
                <ChevronDown className="w-3 h-3 text-gray-400 dark:text-slate-500 pointer-events-none absolute right-0" />
              </div>
            </div>
          )}

          {/* Activity view */}
          {analyzing && (
            <ProgressiveActivity title="Updating your matches" steps={activitySteps} />
          )}

          {searching && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 dark:bg-[#1E3A5F]/60 border border-blue-100 dark:border-[#2563EB]/25 rounded-xl">
              <Loader2 className="w-3.5 h-3.5 text-[#2563EB] animate-spin flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-semibold text-[#2563EB] dark:text-blue-300">
                  {searchStage === 'fallback'
                    ? 'Expanding search to more sources…'
                    : 'Fetching jobs from primary sources · Running AI scoring…'}
                </p>
                {searchStage === 'fallback' && (
                  <p className="text-[11px] text-blue-400 dark:text-blue-400/80 mt-0.5">
                    Trying additional job sources · This may take up to 2–3 mins
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Empty — no jobs to show */}
          {!isLoading && jobsToDisplay.length === 0 && dataLoaded && !analyzeError && (
            <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-[#1E293B] rounded-2xl border border-dashed border-[#E5E7EB] dark:border-[#334155] text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#F8FAFC] dark:bg-[#263549] flex items-center justify-center mb-3">
                <Briefcase className="w-5 h-5 text-gray-300 dark:text-slate-600" />
              </div>
              {mode === 'manual' ? (
                <>
                  <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">
                    {searchHadError ? 'Unable to fetch jobs' : 'No results found'}
                  </p>
                  <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1 max-w-xs leading-relaxed">
                    {searchMessage ||
                      (searchHadError
                        ? 'Job sources failed to respond. Try again or use AI search.'
                        : 'Try broader keywords — e.g. "Sales Manager" instead of "MEP Sales Head"')}
                  </p>
                  {!searchHadError && (
                    <p className="text-[11px] text-gray-300 dark:text-slate-600 mt-2">
                      Tip: use a common job title for best results
                    </p>
                  )}
                </>
              ) : !hasResume ? (
                <>
                  <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">No resume found</p>
                  <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1">
                    <a href="/resume" className="text-[#2563EB] font-semibold hover:underline">Upload your resume</a> to get AI-matched jobs.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">No AI matches yet</p>
                  <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1 mb-4">Search above or auto-match with your resume</p>
                  <button
                    onClick={() => { autoTriggered.current = false; triggerAnalyze(false) }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-100"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />Auto-match with my resume
                  </button>
                </>
              )}
            </div>
          )}

          {/* Empty — jobs exist but all filtered out */}
          {!isLoading && jobsToDisplay.length > 0 && tieredJobs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 bg-white dark:bg-[#1E293B] rounded-2xl border border-dashed border-[#E5E7EB] dark:border-[#334155] text-center">
              <SlidersHorizontal className="w-5 h-5 text-gray-300 dark:text-slate-600 mb-2" />
              <p className="font-bold text-[13px] text-[#0F172A] dark:text-[#F1F5F9]">No jobs match the current filters</p>
              <div className="flex items-center gap-3 mt-3">
                <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-[12px] font-semibold text-[#2563EB] hover:underline">
                  Clear filters
                </button>
                {tierFilter !== 'all' && (
                  <button onClick={() => setTierFilter('all')} className="text-[12px] font-semibold text-amber-600 hover:underline">
                    Show all tiers
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Job cards — dimmed while loading */}
          <div className={`space-y-4 transition-opacity duration-300 ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            {tieredJobs.map((match, i) => (
              <JobCard
                key={match.id}
                match={match}
                isManual={mode === 'manual'}
                isNew={match.id === newlyAddedId}
                initialSaved={savedJobIds.has(match.job.id)}
                initialApplicationId={savedJobToAppId.get(match.job.id)}
                isOptimized={optimizedJobIds.has(match.job.id)}
                optimizedResumeId={optimizedResumesByJobId.get(match.job.id)?.id}
                onOptimize={handleOptimize}
                onInterview={handleInterview}
                onViewOptimized={() => setViewOptimizedJobId(match.job.id)}
                onDeleteOptimized={handleDeleteOptimized}
                animIndex={i}
              />
            ))}

            {/* CV suggestions follow the results */}
            {displaySuggestions.length > 0 && (
              <CvSuggestions suggestions={displaySuggestions} />
            )}
          </div>
        </div>

        {/* ── Filter panel ─────────────────────────────────────────── */}
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters(DEFAULT_FILTERS)}
          className="hidden xl:block w-60 flex-shrink-0"
        />
      </div>

      {viewOptimizedJobId && (() => {
        const entry = optimizedResumesByJobId.get(viewOptimizedJobId)
        if (!entry) return null
        return (
          <ResumePreviewModal
            data={entry.data}
            onClose={() => setViewOptimizedJobId(null)}
            heading="Optimized Resume"
            previewSubtitle="Resume tailored for this specific job."
          />
        )
      })()}

      {showPaywall && profileData?.plan !== 'pro' && <PaywallModal onClose={() => setShowPaywall(false)} />}

      {optimizeJobId && (
        <OptimizeFlow
          mode="job"
          jobId={optimizeJobId}
          onClose={() => setOptimizeJobId(null)}
          onSaved={() => globalMutate('/api/resume/optimize')}
        />
      )}

      {interviewMatch && (
        <InterviewModal
          job={{
            id: interviewMatch.job.id,
            title: interviewMatch.job.title,
            company: interviewMatch.job.company,
            description: interviewMatch.job.description,
          }}
          isPro={profileData?.plan === 'pro'}
          mode="job-based"
          onClose={() => setInterviewMatch(null)}
        />
      )}
    </div>
  )
}
