'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  Search, MapPin,
  PlusCircle, Loader2, Briefcase, Lightbulb,
  RefreshCw, Sparkles,
  SlidersHorizontal, ChevronDown, Lock,
  X, User, Clock, ChevronRight, CheckCircle2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { track } from '@/lib/analytics'
import useSWR, { mutate as globalMutate } from 'swr'
import { PaywallModal } from '@/components/PaywallModal'
import { InterviewModal } from '@/components/InterviewModal'
import { OptimizeFlow }    from '@/components/resume/OptimizeFlow'
import { ResumePreviewModal } from '@/components/resume/ResumePreviewModal'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'
import { ProgressiveActivity } from '@/components/ProgressiveActivity'
import { useAnalyzeProgress, type StepDefinition } from '@/lib/useAnalyzeProgress'
import { FREE_LIMITS } from '@/lib/limits'
import { CountryConfirmStep, COUNTRY_CODE_TO_NAME, type CountryChoice } from '@/components/resume/CountryConfirmStep'
import {
  JobCard, MatchRecord,
  extractExperience, extractJobType, extractWorkMode, extractExpMin, formatPostedDate,
  NEGATIVE_REASON_PATTERN,
} from '@/components/jobs/JobCard'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Scope localStorage keys to the logged-in user so switching accounts in the
// same browser never leaks one user's guard timestamps or location into another's.
function lsKey(base: string, uid: string | undefined): string {
  return uid ? `${base}:${uid}` : base
}

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

interface FilterState {
  minScore: number
  jobType: string
  experience: string
  location: string
  datePosted: string
}

const DEFAULT_FILTERS: FilterState = { minScore: 0, jobType: 'Any', experience: 'Any', location: '', datePosted: 'Any time' }

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
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5 space-y-6">
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

// ── DeleteConfirmModal ────────────────────────────────────────────────────────

function DeleteConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-6 z-10">
        <h3 className="font-bold text-[17px] text-[#0F172A] dark:text-[#F1F5F9] mb-2">
          Delete optimized resume?
        </h3>
        <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed mb-6">
          This will remove the saved optimized version for this job and restore your original match score.
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold transition-all"
          >
            Delete Resume
          </button>
        </div>
      </div>
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
  const [showPaywall, setShowPaywall]               = useState(false)
  const [showInterviewPaywall, setShowInterviewPaywall] = useState(false)
  const [sortKey, setSortKey]                       = useState<'score' | 'date'>('score')
  const [interviewMatch, setInterviewMatch]         = useState<MatchRecord | null>(null)
  const [optimizeJobId, setOptimizeJobId]         = useState<string | null>(null)
  const [celebratingJobId, setCelebratingJobId]   = useState<string | null>(null)
  const pendingCelebrationRef                     = useRef<string | null>(null)
  const [viewOptimized, setViewOptimized]   = useState<{ jobId: string; autoDownload?: boolean } | null>(null)
  const [deleteConfirmJobId, setDeleteConfirmJobId] = useState<string | null>(null)
  const [showDownloadPaywall, setShowDownloadPaywall] = useState(false)
  const [tierFilter, setTierFilter]         = useState<'all' | 'high' | 'medium' | 'stretch'>('all')
  const [localOptimizedResumes, setLocalOptimizedResumes] = useState<Map<string, OptimizedResumeData>>(() => new Map())

  // mode determines which list is rendered — never both simultaneously
  const [mode, setMode]                 = useState<'ai' | 'manual'>('ai')
  // null = not yet set, fall back to SWR ai jobs
  const [aiJobs, setAiJobs]             = useState<MatchRecord[] | null>(null)
  const [manualJobs, setManualJobs]     = useState<MatchRecord[]>([])
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null)
  const [suggestions, setSuggestions]       = useState<string[]>([])
  // Initialise from bare key as a safe fallback (user_id not yet known at mount time).
  // A useEffect below re-reads from the user-scoped key once profileData arrives.
  const [detectedCountry, setDetectedCountry] = useState<string>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('detectedCountry') ?? '') : ''
  )
  const [detectedCity, setDetectedCity] = useState<string>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('detectedCity') ?? '') : ''
  )
  const [analyzing, setAnalyzing]           = useState(false)
  const [isLocationChange, setIsLocationChange] = useState(false)
  const [analyzeError, setAnalyzeError]     = useState('')
  // Country confirmation pause state — set when the server asks the user to confirm
  // their target job search country before fetching begins.
  const [countryConfirmPending, setCountryConfirmPending] = useState<{
    detectedCountry: string | null
    detectedCountryCode: string | null
    context: 'initial_analysis' | 'change_search_location'
  } | null>(null)
  const [pendingForce, setPendingForce]                 = useState(false)
  const [preferredSearchCountry, setPreferredSearchCountry] = useState<string | null>(null)
  // Country actively being used in the current analysis — shown as "Searching in X · Change" chip.
  const [activeSearchCountry, setActiveSearchCountry] = useState<{
    code: string | null    // null = international_remote
    name: string           // display name e.g. "India" or "International / Remote"
    mode: 'country' | 'international_remote'
  } | null>(null)
  // AbortController for the current in-flight analysis fetch — used by "Change" to cancel mid-analysis.
  const currentAnalysisAbortRef  = useRef<AbortController | null>(null)
  // Last precheck result — stored so "Change" mid-analysis can restore the full confirmation UI.
  const lastPrecheckInfoRef = useRef<{ detectedCountry: string | null; detectedCountryCode: string | null } | null>(null)
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

  const userId: string | undefined = profileData?.user_id as string | undefined

  // Once we know which user is logged in, re-read location from their scoped key so
  // switching accounts in the same browser doesn't show the previous user's location.
  useEffect(() => {
    if (typeof window === 'undefined' || !userId) return
    const country = localStorage.getItem(lsKey('detectedCountry', userId))
    const city    = localStorage.getItem(lsKey('detectedCity', userId))
    if (country !== null) setDetectedCountry(country)
    if (city    !== null) setDetectedCity(city)
    // Load saved preferred search country for pre-selecting in the confirmation UI
    const preferred = localStorage.getItem(lsKey('preferredSearchCountry', userId))
    if (preferred) {
      setPreferredSearchCountry(preferred)
      // Restore the chip so "Showing jobs in X · Change" is visible on page load with existing matches
      setActiveSearchCountry({
        code: preferred,
        name: COUNTRY_CODE_TO_NAME[preferred] ?? preferred,
        mode: 'country',
      })
    }
  }, [userId])

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

  const appliedJobIds = useMemo(() => {
    const ids = new Set<string>()
    for (const app of (appsData?.applications ?? [])) {
      if (app.status === 'applied' && app.job?.id) ids.add(app.job.id)
    }
    return ids
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

  // Merged: DB-persisted (Pro) + session-local (free). DB entries take precedence.
  const allOptimizedByJobId = useMemo(() => {
    const map = new Map<string, { id?: string; data: OptimizedResumeData }>()
    for (const [jid, entry] of optimizedResumesByJobId) map.set(jid, entry)
    for (const [jid, data] of localOptimizedResumes) {
      if (!map.has(jid)) map.set(jid, { data })
    }
    return map
  }, [optimizedResumesByJobId, localOptimizedResumes])

  const allOptimizedJobIds = useMemo(() => new Set(allOptimizedByJobId.keys()), [allOptimizedByJobId])

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
  // Guard key is user-scoped so switching accounts in the same browser doesn't
  // suppress the new user's first analysis.
  useEffect(() => {
    if (!data || !profileData || autoTriggered.current || analyzing) return
    const hasAiMatches = savedAiJobs.length > 0 || aiJobs !== null
    if (!hasAiMatches && hasResume) {
      const lastAnalyzed = Number(localStorage.getItem(lsKey('lastAnalyzedAt', userId)) ?? 0)
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000
      if (lastAnalyzed > tenMinutesAgo) return   // recently analyzed — skip auto-trigger
      autoTriggered.current = true
      triggerAnalyze(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // ── Shared SSE analysis runner ────────────────────────────────────────────
  // Called after country is confirmed (either from CountryConfirmStep or from saved preference).
  // Handles the full SSE fetch, stream reading, and post-processing.
  async function runAnalysis(isReanalyze: boolean, choice: CountryChoice) {
    const countryName = choice.searchMode === 'international_remote'
      ? 'International / Remote'
      : (COUNTRY_CODE_TO_NAME[choice.selectedSearchCountry ?? ''] ?? choice.selectedSearchCountry ?? '')

    setMode('ai')
    setAiJobs([])
    setSuggestions([])
    setAnalyzing(true)
    setActiveSearchCountry({
      code: choice.searchMode === 'international_remote' ? null : choice.selectedSearchCountry,
      name: countryName,
      mode: choice.searchMode,
    })
    setAnalyzeError('')
    setTierFilter('all')
    resetProgress()

    const controller = new AbortController()
    currentAnalysisAbortRef.current = controller

    let matchCount    = 0
    let cvSuggestions: string[] = []
    let hadError      = false
    let errorMessage  = ''
    let noJobsMessage = ''
    let succeeded     = false

    try {
      const res = await fetch('/api/resume/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  controller.signal,
        body: JSON.stringify({
          force:                 isReanalyze,
          selectedSearchCountry: choice.selectedSearchCountry,
          searchMode:            choice.searchMode,
          wasDetected:           choice.wasDetected,
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        if (d.requiresUpgrade) { stopProgress(); setShowPaywall(true); return }
        const message = userFacingError(d.error ?? 'Analysis failed.')
        localStorage.setItem(lsKey('lastAnalyzedAt', userId), String(Date.now()))
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
                    localStorage.setItem(lsKey('detectedCountry', userId), country)
                  }
                  if (event.detectedCity) {
                    const city = event.detectedCity as string
                    setDetectedCity(city)
                    localStorage.setItem(lsKey('detectedCity', userId), city)
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
        localStorage.setItem(lsKey('lastAnalyzedAt', userId), String(Date.now()))
        setAnalyzeError(errorMessage)
        toast.error(errorMessage)
        return
      }

      if (matchCount === 0) {
        // Still refresh from DB — there may be matches from a prior successful run
        const fresh = await mutate()
        const existing = (fresh?.matches ?? []) as MatchRecord[]
        if (existing.length > 0) {
          setAiJobs(existing.filter((m) => m.job?.source !== 'manual'))
        } else {
          setAiJobs(null)   // reset so savedAiJobs (DB) can show if any appear later
        }
        setAnalyzeError(noJobsMessage || 'No jobs found. Try the search form.')
        return
      }

      localStorage.setItem(lsKey('lastAnalyzedAt', userId), String(Date.now()))
      toast.success(`Found ${matchCount} AI-ranked matches!`)
      const fresh    = await mutate()
      const allFresh: MatchRecord[] = fresh?.matches ?? []
      const newAi    = allFresh
        .filter((m) => m.job?.source !== 'manual')
        .filter((m) => !isReanalyze || (m.ai_score >= 40 && m.ai_score <= 100))
      setAiJobs(newAi)
      if (cvSuggestions.length > 0) setSuggestions(cvSuggestions)
      void globalMutate('/api/profile')
      succeeded = true
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return  // user clicked "Change"
      setAnalyzeError('Analysis failed. Check the terminal for errors.')
      stopProgress()
    } finally {
      currentAnalysisAbortRef.current = null
      setAnalyzing(false)
      setIsLocationChange(false)
      if (!succeeded) setActiveSearchCountry(null)
    }
  }

  // ── triggerAnalyze ────────────────────────────────────────────────────────
  // Entry point for both auto-trigger and "Re-analyze by AI" button.
  // If a preferred search country is saved in localStorage, uses it immediately
  // (no precheck round-trip, no full confirmation UI).
  // Otherwise sends a precheck request and waits for country_confirmation_required.
  async function triggerAnalyze(reanalyze: boolean) {
    const isPro = profileData?.plan === 'pro'
    if (!isPro && (profileData?.ai_reanalyze_count ?? 0) >= FREE_LIMITS.aiReanalyze) {
      setShowPaywall(true)
      return
    }

    track.aiAnalyzeClick()

    // Read saved preference directly from localStorage (state may not be loaded yet on auto-trigger)
    const savedPreferred = typeof window !== 'undefined' && userId
      ? localStorage.getItem(lsKey('preferredSearchCountry', userId))
      : null

    if (savedPreferred) {
      // Known country — skip precheck, go straight to analysis
      await runAnalysis(reanalyze, {
        searchMode: 'country',
        selectedSearchCountry: savedPreferred,
        wasDetected: false,
      })
      return
    }

    // No saved preference — run precheck to detect country from resume, then show confirmation UI
    setMode('ai')
    setAiJobs([])
    setSuggestions([])
    setAnalyzing(true)
    setAnalyzeError('')
    setTierFilter('all')
    resetProgress()

    try {
      const res = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: reanalyze }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        if (d.requiresUpgrade) { stopProgress(); setShowPaywall(true); return }
        const message = userFacingError(d.error ?? 'Analysis failed.')
        localStorage.setItem(lsKey('lastAnalyzedAt', userId), String(Date.now()))
        setAnalyzeError(message)
        toast.error(message)
        stopProgress()
        return
      }

      const jsonData = await res.json().catch(() => ({}))
      if (jsonData.status === 'country_confirmation_required') {
        const base = {
          detectedCountry:     (jsonData.detectedCountry     as string | null) ?? null,
          detectedCountryCode: (jsonData.detectedCountryCode as string | null) ?? null,
        }
        lastPrecheckInfoRef.current = base
        setCountryConfirmPending({ ...base, context: 'initial_analysis' })
        setPendingForce(reanalyze)
        setAnalyzing(false)
        return
      }

      setAnalyzeError('Unexpected response. Please try again.')
      stopProgress()
    } catch {
      setAnalyzeError('Analysis failed. Check the terminal for errors.')
      stopProgress()
    } finally {
      setAnalyzing(false)
    }
  }

  // ── handleCountryConfirmed ────────────────────────────────────────────────
  // Called by CountryConfirmStep when user picks a country or international mode.
  function handleCountryConfirmed(choice: CountryChoice) {
    const wasLocationChange = countryConfirmPending?.context === 'change_search_location'
    if (choice.searchMode === 'country' && userId) {
      localStorage.setItem(lsKey('preferredSearchCountry', userId), choice.selectedSearchCountry)
      setPreferredSearchCountry(choice.selectedSearchCountry)
    }
    setCountryConfirmPending(null)
    setIsLocationChange(wasLocationChange)
    void runAnalysis(pendingForce, choice)
  }

  // ── handleChangeCountry ───────────────────────────────────────────────────
  // Called by the "Searching in X · Change" chip while analysis is running.
  // Aborts the current fetch, clears active country, and restores the confirmation UI.
  function handleChangeCountry() {
    if (currentAnalysisAbortRef.current) {
      currentAnalysisAbortRef.current.abort()
      currentAnalysisAbortRef.current = null
    }
    setAnalyzing(false)
    // Do NOT clear activeSearchCountry here — it holds the committed location for the chip.
    // The chip is hidden while countryConfirmPending is set, and restored on modal close.
    // Only handleCountryConfirmed should update activeSearchCountry.
    const base = lastPrecheckInfoRef.current ?? { detectedCountry: null, detectedCountryCode: null }
    setCountryConfirmPending({ ...base, context: 'change_search_location' })
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
    const credits      = profileData?.credits_remaining
    const OPTIMIZE_COST = 2  // jobOptimize credit cost
    if (credits != null && credits < OPTIMIZE_COST) {
      setShowPaywall(true)
      return
    }
    setOptimizeJobId(jobId)
  }

  function handleInterview(match: MatchRecord) {
    const credits        = profileData?.credits_remaining
    const INTERVIEW_COST = 2  // interviewSession credit cost

    // Only block when we know the balance is too low.
    // If credits_remaining is null (not yet loaded) let the user through —
    // the API enforces the credit check server-side.
    // Plan-level gating (Pro vs free) happens inside InterviewModal itself.
    if (credits != null && credits < INTERVIEW_COST) {
      setShowInterviewPaywall(true)
      return
    }
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

  function handleLocalSaved(jobId: string, data: OptimizedResumeData) {
    setLocalOptimizedResumes(prev => {
      const next = new Map(prev)
      next.set(jobId, data)
      return next
    })
  }

  function handleClearLocalOptimized(jobId: string) {
    setLocalOptimizedResumes(prev => {
      const next = new Map(prev)
      next.delete(jobId)
      return next
    })
  }

  // Pro: download icon opens modal with auto-download; Free: download paywall
  function handleDownloadOptimizedClick(jobId: string) {
    if (isCurrentUserPro) {
      setViewOptimized({ jobId, autoDownload: true })
    } else {
      setShowDownloadPaywall(true)
    }
  }

  // Save edits made from within the "View Optimized Resume" modal — persists for all users
  async function handleViewOptimizedSaveEdits(jobId: string, edited: OptimizedResumeData) {
    const res = await fetch('/api/resume/optimize/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optimizedData: edited, jobId }),
    })
    if (!res.ok) { toast.error('Failed to save changes.'); return }
    handleLocalSaved(jobId, edited)  // optimistic update while SWR re-fetches
    globalMutate('/api/resume/optimize')
    toast.success('Changes saved.')
  }

  // Confirm delete: Pro deletes from DB; Free clears local state
  async function handleConfirmDelete(jobId: string) {
    const entry = allOptimizedByJobId.get(jobId)
    if (!entry) return
    if (entry.id) {
      try { await handleDeleteOptimized(entry.id) } catch { /* error toasted inside */ }
    } else {
      handleClearLocalOptimized(jobId)
      toast.success('Optimized resume removed')
    }
  }

  // activitySteps comes from useAnalyzeProgress — driven by real SSE events + time gating

  // Pro = any paid plan; free = 'free' or not yet loaded
  const isCurrentUserPro = profileData !== undefined && (profileData?.plan ?? 'free') !== 'free'

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
                Unlock more searches
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
      <div className="flex flex-col xl:flex-row gap-5">

        {/* ── Single results section — renders AI or Manual, never both ── */}
        <div className="flex-1 min-w-0 space-y-4" ref={aiSectionRef}>

          {!analyzing && (
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
          )}

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
                  {reanalyzeLimitHit && (
                    <button
                      onClick={() => setShowPaywall(true)}
                      className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Unlock unlimited re-analysis
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

          {/* Tier tabs + country chip — visible when there are jobs to show */}
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

              {/* Country/search chip — desktop only (xl+); mobile renders its own row below */}
              {activeSearchCountry && !countryConfirmPending && (
                <div className="hidden xl:ml-auto xl:flex items-center gap-0.5 text-[11px]">
                  <MapPin className="w-3 h-3 text-[#2563EB] flex-shrink-0 mr-0.5" />
                  {activeSearchCountry.mode === 'international_remote' ? (
                    <span className="text-gray-400 dark:text-slate-500 font-normal">Showing international / remote jobs</span>
                  ) : (
                    <>
                      <span className="text-gray-400 dark:text-slate-500 font-normal">Showing jobs in</span>
                      <span className="text-gray-600 dark:text-slate-300 font-medium ml-0.5">{activeSearchCountry.name}</span>
                    </>
                  )}
                  <span className="text-gray-300 dark:text-slate-600 mx-0.5">·</span>
                  <button
                    onClick={handleChangeCountry}
                    className="text-[10px] text-gray-400 dark:text-slate-500 font-normal hover:underline underline-offset-2 hover:text-gray-500 dark:hover:text-slate-400 transition-colors"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Country chip — mobile only, own row below tier pills */}
          {sortedJobs.length > 0 && activeSearchCountry && !countryConfirmPending && (
            <div className="flex xl:hidden items-center gap-0.5 text-[11px]">
              <MapPin className="w-3 h-3 text-[#2563EB] flex-shrink-0 mr-0.5" />
              {activeSearchCountry.mode === 'international_remote' ? (
                <span className="text-gray-400 dark:text-slate-500 font-normal">Showing international / remote jobs</span>
              ) : (
                <>
                  <span className="text-gray-400 dark:text-slate-500 font-normal">Showing jobs in</span>
                  <span className="text-gray-600 dark:text-slate-300 font-medium ml-0.5">{activeSearchCountry.name}</span>
                </>
              )}
              <span className="text-gray-300 dark:text-slate-600 mx-0.5">·</span>
              <button
                onClick={handleChangeCountry}
                className="text-[10px] text-gray-400 dark:text-slate-500 font-normal hover:underline underline-offset-2 hover:text-gray-500 dark:hover:text-slate-400 transition-colors"
              >
                Change
              </button>
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

          {/* Country confirmation modal — centered overlay */}
          {countryConfirmPending && !analyzing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCountryConfirmPending(null)} />
              <div className="relative w-full max-w-sm">
                <button
                  onClick={() => setCountryConfirmPending(null)}
                  className="absolute -top-3 -right-3 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 shadow-sm transition-colors"
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <CountryConfirmStep
                  detectedCountryCode={countryConfirmPending.detectedCountryCode}
                  detectedCountryName={countryConfirmPending.detectedCountry}
                  savedPreferredCode={preferredSearchCountry}
                  onConfirm={handleCountryConfirmed}
                  context={countryConfirmPending.context}
                  activeCountryName={activeSearchCountry?.name ?? null}
                  activeCountryMode={activeSearchCountry?.mode ?? null}
                />
              </div>
            </div>
          )}


          {/* Activity view — shown while analysis is running */}
          {analyzing && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,0.85fr)_minmax(360px,1.15fr)] gap-5">
              <ProgressiveActivity title="Updating your matches" steps={activitySteps} />
              <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A] shadow-sm">
                <div className="aspect-video w-full">
                  <video
                    className="h-full w-full object-cover"
                    src="/coffee.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                </div>
                <p className="text-center text-[16px] font-bold py-4 px-6 tracking-wider bg-gradient-to-r from-slate-200 via-white to-slate-300 bg-clip-text text-transparent">
                  Grab a coffee while AI finds your best-fit jobs.
                </p>
              </div>
            </div>
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
                initialIsApplied={appliedJobIds.has(match.job.id)}
                isOptimized={allOptimizedJobIds.has(match.job.id)}
                optimizedScore={allOptimizedByJobId.get(match.job.id)?.data.ats_score}
                celebrate={celebratingJobId === match.job.id}
                isOptimizing={optimizeJobId === match.job.id}
                onOptimize={handleOptimize}
                onInterview={handleInterview}
                onViewOptimized={() => setViewOptimized({ jobId: match.job.id })}
                onDownloadOptimized={() => handleDownloadOptimizedClick(match.job.id)}
                onDeleteRequest={() => setDeleteConfirmJobId(match.job.id)}
                animIndex={i}
              />
            ))}

            {/* Free plan — show upgrade banner when matches are capped */}
            {!isLoading && mode === 'ai' && profileData?.plan !== 'pro' && profileData !== undefined &&
              (data?.totalMatches ?? 0) > (data?.matchLimit ?? FREE_LIMITS.matchesPerDay) && (
              <div className="flex flex-col items-center gap-2 py-6 px-5 rounded-2xl border border-dashed border-[#E5E7EB] dark:border-[#334155] text-center">
                <Lock className="w-4 h-4 text-gray-300 dark:text-slate-600" />
                <p className="text-[13px] font-semibold text-gray-600 dark:text-slate-300">
                  {(data?.totalMatches ?? 0) - (data?.matchLimit ?? FREE_LIMITS.matchesPerDay)} more matched jobs waiting for you
                </p>
                <p className="text-[12px] text-gray-400 dark:text-slate-500">
                  You&apos;re seeing {data?.matchLimit ?? FREE_LIMITS.matchesPerDay} of {data?.totalMatches} AI-ranked matches.
                </p>
                <button
                  onClick={() => setShowPaywall(true)}
                  className="mt-1 px-4 py-1.5 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] text-white text-[12px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-colors"
                >
                  See all {data?.totalMatches} matches
                </button>
              </div>
            )}

            {/* CV suggestions follow the results */}
            {displaySuggestions.length > 0 && (
              <CvSuggestions suggestions={displaySuggestions} />
            )}
          </div>
        </div>

        {/* ── Right column: filter + applied jobs ──────────────────── */}
        {!analyzing && (
          <div className="hidden xl:block w-60 flex-shrink-0">
            <div className="flex flex-col gap-4 [@media(min-width:1280px)_and_(min-height:700px)]:sticky [@media(min-width:1280px)_and_(min-height:700px)]:top-6">
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters(DEFAULT_FILTERS)}
              className="w-full"
            />

            {/* ── Applied Jobs ───────────────────────────────────── */}
            <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-[12px] uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500">
                  Applied Jobs
                </h3>
                {appliedJobIds.size > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800">
                    {appliedJobIds.size}
                  </span>
                )}
              </div>
              <button
                onClick={() => router.push('/tracker')}
                className="w-full group flex items-center gap-3 px-3.5 py-3 rounded-xl border border-[#E5E7EB] dark:border-[#2D3D55] bg-transparent hover:bg-[#F8FAFC] dark:hover:bg-[#1C2E45] hover:border-[#CBD5E1] dark:hover:border-[#3D5170] transition-all text-left"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-green-50 dark:bg-green-950/50">
                  <CheckCircle2 className="w-[15px] h-[15px] text-green-500 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13px] text-[#0F172A] dark:text-[#CBD5E1] leading-tight">View All Applied Jobs</p>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">See jobs you have marked as applied</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
            </div>
          </div>
        )}
      </div>

      {viewOptimized && (() => {
        const entry = allOptimizedByJobId.get(viewOptimized.jobId)
        if (!entry) return null
        return (
          <ResumePreviewModal
            data={entry.data}
            onClose={() => setViewOptimized(null)}
            heading="Optimized Resume for This Job"
            previewSubtitle={isCurrentUserPro ? 'Review and edit your saved optimized resume.' : 'Your AI-tailored resume for this job.'}
            canDownload={isCurrentUserPro}
            onLockedDownload={!isCurrentUserPro ? () => { setViewOptimized(null); setShowDownloadPaywall(true) } : undefined}
            isOptimizedPreview
            viewMode
            autoDownload={viewOptimized.autoDownload && isCurrentUserPro}
            onSaveEdits={async (edited) => handleViewOptimizedSaveEdits(viewOptimized.jobId, edited)}
          />
        )
      })()}

      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} />}

      {showInterviewPaywall && (
        <PaywallModal
          variant="interview"
          onClose={() => setShowInterviewPaywall(false)}
          onMaybeLater={() => setShowInterviewPaywall(false)}
        />
      )}

      {showDownloadPaywall && (
        <PaywallModal
          variant="download"
          onClose={() => setShowDownloadPaywall(false)}
          onMaybeLater={() => setShowDownloadPaywall(false)}
        />
      )}

      {deleteConfirmJobId && (
        <DeleteConfirmModal
          onCancel={() => setDeleteConfirmJobId(null)}
          onConfirm={() => {
            const jobId = deleteConfirmJobId
            setDeleteConfirmJobId(null)
            void handleConfirmDelete(jobId)
          }}
        />
      )}

      {optimizeJobId && (
        <OptimizeFlow
          mode="job"
          jobId={optimizeJobId}
          userId={userId}
          onClose={() => {
            const jobId = pendingCelebrationRef.current
            pendingCelebrationRef.current = null
            setOptimizeJobId(null)
            if (jobId) {
              setCelebratingJobId(jobId)
              setTimeout(() => setCelebratingJobId(null), 3500)
            }
          }}
          onSaved={() => {
            globalMutate('/api/resume/optimize')
            pendingCelebrationRef.current = optimizeJobId
          }}
          onLocalSaved={handleLocalSaved}
          onUpgradeRequired={() => setShowPaywall(true)}
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
