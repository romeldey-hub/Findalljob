'use client'

import { useState, useCallback, type CSSProperties } from 'react'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2,
  Sparkles, RefreshCcw, Trash2, X, AlertTriangle, Lock,
  BrainCircuit, UserRoundSearch, BriefcaseBusiness, Trophy, Coffee, Coins, ArrowRight,
} from 'lucide-react'
import { track } from '@/lib/analytics'
import { ProgressiveActivity } from '@/components/ProgressiveActivity'
import { useAnalyzeProgress, type StepDefinition } from '@/lib/useAnalyzeProgress'
import { CountryConfirmStep, COUNTRY_CODE_TO_NAME, type CountryChoice } from '@/components/resume/CountryConfirmStep'
import { CreateResumeWithAI } from '@/components/resume/CreateResumeWithAI'

// ── Progress configuration (outside component — never recreated) ──────────────

const UPLOAD_STEP_DEFS: StepDefinition[] = [
  { label: 'Reading your resume...',        defaultDescription: 'Opening the file and checking the content.' },
  { label: 'Understanding your profile...', defaultDescription: 'Extracting your skills, roles, and career path.' },
  { label: 'Creating search strategy...',   defaultDescription: 'Building focused queries for your background.' },
  { label: 'Searching job sources...',      defaultDescription: 'Searching multiple job sources for matches.' },
  { label: 'Checking job relevance...',     defaultDescription: 'Filtering the most relevant opportunities.' },
  { label: 'Scoring matches...',            defaultDescription: 'AI is scoring jobs against your profile.' },
  { label: 'Preparing matched jobs...',     defaultDescription: 'Saving and organising your best matches.' },
]

const UPLOAD_STEP_MAP: Record<string, number> = {
  resume_loaded:  1,
  profile_parsed: 1,
  strategy_ready: 2,
  jobs_fetching:  3,
  pool_selected:  4,
  ai_ranking:     5,
  matches_saved:  6,
}

function persistUploadSearchScope(userId: string, choice: CountryChoice, searchRunId?: string | null) {
  const scope = choice.searchMode === 'international_remote'
    ? {
        searchMode: 'international_remote',
        countryCode: null,
        countryName: 'International / Remote',
        searchRunId: searchRunId ?? null,
      }
    : {
        searchMode: 'country',
        countryCode: choice.selectedSearchCountry,
        countryName: COUNTRY_CODE_TO_NAME[choice.selectedSearchCountry] ?? choice.selectedSearchCountry,
        searchRunId: searchRunId ?? null,
      }
  localStorage.setItem(`jobSearchScope:${userId}`, JSON.stringify(scope))
  localStorage.setItem(`preferredSearchMode:${userId}`, choice.searchMode)
  if (choice.searchMode === 'international_remote') {
    localStorage.removeItem(`preferredSearchCountry:${userId}`)
  } else {
    localStorage.setItem(`preferredSearchCountry:${userId}`, choice.selectedSearchCountry)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ResumeUploadZoneProps {
  hasExistingResume: boolean
  resumeInfo?: { file_url: string; created_at: string; version: number } | null
  isPro?: boolean
  uploadCount?: number
  uploadLimit?: number
  userId?: string
  avatarUrl?: string | null
  creditsRemaining?: number | null
}

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'country_confirm' | 'success' | 'no-text'

export function ResumeUploadZone({ hasExistingResume, resumeInfo, isPro = true, uploadCount = 0, uploadLimit = 3, userId, avatarUrl, creditsRemaining = null }: ResumeUploadZoneProps) {
  const uploadLimitReached = !isPro && uploadCount >= uploadLimit
  const router = useRouter()
  const [uploadState, setUploadState]   = useState<UploadState>('idle')
  const [uploadError, setUploadError]   = useState<string | null>(null)
  const [showConfirm, setShowConfirm]   = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [activityFailed, setActivityFailed] = useState(false)
  const [countryConfirmPending, setCountryConfirmPending] = useState<{
    detectedCountry: string | null
    detectedCountryCode: string | null
  } | null>(null)

  const { activitySteps, onSSEEvent, reset: resetProgress, stop: stopProgress } =
    useAnalyzeProgress({ stepDefs: UPLOAD_STEP_DEFS, stepMap: UPLOAD_STEP_MAP })

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setUploadState('uploading')
    setUploadError(null)
    setActivityFailed(false)
    resetProgress(0)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const uploadRes  = await fetch('/api/resume/upload', { method: 'POST', body: formData })
      const uploadData = await uploadRes.json()

      if (!uploadRes.ok) {
        toast.error(uploadData.error ?? 'Upload failed')
        setUploadState('idle')
        stopProgress()
        return
      }
      if (!uploadData.canAnalyze) {
        const errMsg = (uploadData.error as string) ?? 'Could not extract readable text from this file.'
        setUploadError(errMsg)
        setUploadState('no-text')
        toast.warning(errMsg)
        stopProgress()
        return
      }
      if (!uploadData.hasText) {
        toast.info('Text extraction was limited — using AI document parsing for this PDF.')
      }
    } catch {
      toast.error('Upload failed. Please check your connection and try again.')
      setUploadState('idle')
      stopProgress()
      return
    }

    // Phase 1: parse resume only — no job search yet
    setUploadState('analyzing')
    resetProgress(1)
    toast.info('Parsing your resume…')

    const parseController = new AbortController()
    const parseTimer = setTimeout(() => parseController.abort(), 5 * 60 * 1000)

    try {
      const parseRes = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'parse_resume' }),
        signal: parseController.signal,
      })

      if (!parseRes.ok) {
        let errMsg = 'Resume parsing failed. Your file is saved — try again or search on Matches.'
        try { const d = await parseRes.json(); if (d.error) errMsg = d.error } catch { /* non-JSON */ }
        setActivityFailed(true)
        stopProgress()
        if (typeof window !== 'undefined') localStorage.setItem(userId ? `lastAnalyzedAt:${userId}` : 'lastAnalyzedAt', String(Date.now()))
        toast.warning(errMsg)
        setUploadState('idle')
        resetProgress()
        return
      }

      const parseData = await parseRes.json().catch(() => ({})) as Record<string, unknown>
      if (parseData.status !== 'country_confirmation_required') {
        toast.error('Unexpected server response. Please try again.')
        setUploadState('idle')
        stopProgress()
        return
      }

      // Pause: show country confirmation before starting job search
      stopProgress()
      setCountryConfirmPending({
        detectedCountry:     (parseData.detectedCountry     as string | null) ?? null,
        detectedCountryCode: (parseData.detectedCountryCode as string | null) ?? null,
      })
      setUploadState('country_confirm')
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      toast.warning(isTimeout
        ? 'Parsing timed out. Your resume is saved — try again.'
        : 'Parsing failed. Your resume is saved — try again.')
      setUploadState('idle')
      stopProgress()
    } finally {
      clearTimeout(parseTimer)
    }
  }, [router, resetProgress, stopProgress])

  // Phase 2: job search — called after user confirms their target country
  async function handleCountryConfirmed(choice: CountryChoice) {
    setCountryConfirmPending(null)
    setUploadState('analyzing')
    setActivityFailed(false)
    resetProgress(1)

    if (userId && typeof window !== 'undefined') {
      persistUploadSearchScope(userId, choice)
    }

    let analyzeFailed = false
    let matchCount    = 0
    let searchRunId: string | null = null

    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 10 * 60 * 1000)

    try {
      const analyzeRes = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedSearchCountry: choice.selectedSearchCountry,
          searchMode:            choice.searchMode,
          wasDetected:           choice.wasDetected,
        }),
        signal: controller.signal,
      })

      if (!analyzeRes.ok) {
        let errMsg = 'Analysis failed. Your resume is saved — try searching on the Matches page.'
        try { const d = await analyzeRes.json(); if (d.error) errMsg = d.error } catch { /* non-JSON */ }
        analyzeFailed = true
        setActivityFailed(true)
        stopProgress()
        if (typeof window !== 'undefined') localStorage.setItem(userId ? `lastAnalyzedAt:${userId}` : 'lastAnalyzedAt', String(Date.now()))
        toast.warning(errMsg)
      } else if (analyzeRes.body) {
        const reader  = analyzeRes.body.getReader()
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
                    matchCount = (event.matchCount as number) ?? 0
                    searchRunId = (event.searchRunId as string | null) ?? ((event.searchScope as { searchRunId?: string | null } | undefined)?.searchRunId ?? null)
                  }
                  if (event.error) { analyzeFailed = true; setActivityFailed(true); stopProgress() }
                } catch { /* malformed SSE line */ }
              }
            }
          }
        } finally {
          reader.releaseLock()
        }

        if (!analyzeFailed) {
          track.resumeUpload()
          if (typeof window !== 'undefined') {
            if (userId) persistUploadSearchScope(userId, choice, searchRunId)
            localStorage.setItem(userId ? `lastAnalyzedAt:${userId}` : 'lastAnalyzedAt', String(Date.now()))
          }
          toast.success(`Found ${matchCount} job matches! Redirecting…`)
        } else {
          if (typeof window !== 'undefined') localStorage.setItem(userId ? `lastAnalyzedAt:${userId}` : 'lastAnalyzedAt', String(Date.now()))
          toast.warning('Analysis encountered an issue. Your resume is saved — search for jobs on the Matches page.')
        }
      }
    } catch (err) {
      analyzeFailed = true
      setActivityFailed(true)
      stopProgress()
      if (typeof window !== 'undefined') localStorage.setItem(userId ? `lastAnalyzedAt:${userId}` : 'lastAnalyzedAt', String(Date.now()))
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      toast.warning(
        isTimeout
          ? 'Analysis timed out after 10 minutes. Your resume is saved — search for jobs on the Matches page.'
          : 'Job matching failed. Your resume is saved — you can search for jobs on the Matches page.'
      )
    } finally {
      clearTimeout(abortTimer)
    }

    if (analyzeFailed) {
      setUploadState('idle')
      resetProgress()
      return
    }

    setUploadState('success')
    setTimeout(() => router.push('/matches'), 2000)
  }

  const isCountryConfirmation = uploadState === 'country_confirm'

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    disabled: uploadState !== 'idle' || uploadLimitReached || isCountryConfirmation,
  })

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch('/api/resume', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to delete resume')
        return
      }
      toast.success('Resume deleted successfully')
      setShowConfirm(false)
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const busy       = uploadState === 'uploading' || uploadState === 'analyzing'
  const fileName   = resumeInfo?.file_url
    ? decodeURIComponent(resumeInfo.file_url.split('/').pop()?.split('?')[0] ?? 'resume')
        .replace(/^\d+-/, '')
    : null
  const uploadDate = resumeInfo?.created_at
    ? new Date(resumeInfo.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  // Compact mode: resume exists and not mid-upload
  const compactMode = hasExistingResume && uploadState === 'idle'

  return (
    <>

      {/* ── COMPACT TOP BAR ─────────────────────────────────────────────────── */}
      {compactMode && resumeInfo && (
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm px-5 py-4">
          <div className="flex items-center gap-3">

            {/* File icon */}
            <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#1E3A5F] flex items-center justify-center flex-shrink-0">
              <FileText className="w-[18px] h-[18px] text-[#2563EB]" />
            </div>

            {/* Name + date */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[13px] text-[#0F172A] dark:text-[#F1F5F9] truncate leading-tight">
                {fileName ?? 'resume'}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                Updated {uploadDate}{resumeInfo.version > 1 ? ` · v${resumeInfo.version}` : ''}
              </p>
            </div>

            {/* Ready badge */}
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 flex-shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              Ready
            </span>

            {/* Replace Resume */}
            <button
              type="button"
              onClick={() => open()}
              disabled={uploadLimitReached}
              title={uploadLimitReached ? 'Upload limit reached — upgrade to Pro' : 'Upload a new resume file'}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#263549] text-[12px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#2E3D56] transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCcw className="w-3 h-3 text-gray-400 dark:text-slate-500" />
              Replace Resume
            </button>

            {/* Delete — subtle, red on hover */}
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              title="Delete resume"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0"
            >
              <Trash2 className="w-[15px] h-[15px]" />
            </button>

          </div>
        </div>
      )}

      {/* ── FULL UPLOAD ZONE ────────────────────────────────────────────────── */}
      {/* Hidden in compact mode but kept in DOM so `open()` / getInputProps work */}
      <div className={compactMode ? 'hidden' : undefined}>
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* LEFT: Drag-drop zone */}
            <div
              {...getRootProps()}
              className={[
                'resume-soft-enter flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed p-8 min-h-[200px] cursor-pointer transition-all duration-300',
                isDragActive
                  ? 'border-[#2563EB] bg-blue-50 dark:bg-[#1E3A5F]'
                  : 'border-[#E5E7EB] dark:border-[#334155] hover:border-[#2563EB]/50 hover:bg-[#F8FAFC] dark:hover:bg-[#263549]',
                busy ? 'opacity-70 pointer-events-none' : '',
              ].join(' ')}
            >
              <input {...getInputProps()} />

              {uploadState === 'uploading' && (
                <>
                  <Loader2 className="w-10 h-10 text-[#2563EB] animate-spin mb-3" />
                  <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Uploading…</p>
                  <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-1">Please wait</p>
                </>
              )}

              {uploadState === 'analyzing' && (
                <>
                  <Loader2 className="w-10 h-10 text-[#2563EB] animate-spin mb-3" />
                  <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Finding the best opportunities for you...</p>
                  <p className="text-[13px] font-medium text-gray-500 dark:text-slate-400 mt-1">⏳ This usually takes 3–5 minutes</p>
                  <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-1">We're scanning multiple job sources to find the most relevant matches.</p>
                </>
              )}

              {uploadState === 'country_confirm' && (
                <>
                  <CheckCircle2 className="w-10 h-10 text-green-500 mb-3" />
                  <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Resume analyzed</p>
                  <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-1">Select your job search location to continue</p>
                </>
              )}

              {uploadState === 'success' && (
                <>
                  <CheckCircle2 className="w-10 h-10 text-green-500 mb-3" />
                  <p className="font-semibold text-[14px] text-green-600">Done! Redirecting…</p>
                </>
              )}

              {uploadState === 'no-text' && (
                <>
                  <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
                  <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Could not read file</p>
                  <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 max-w-[240px] text-center leading-relaxed">
                    {uploadError ?? 'Could not extract text from this file.'}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setUploadState('idle'); setUploadError(null) }}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-semibold text-gray-600 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
                  >
                    Try another file
                  </button>
                </>
              )}

              {uploadState === 'idle' && uploadLimitReached && (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mb-4">
                    <Lock className="w-7 h-7 text-amber-500" />
                  </div>
                  <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Upload limit reached</p>
                  <p className="text-[12px] text-gray-500 dark:text-slate-400 mt-1.5 max-w-[220px]">
                    You&apos;ve used all {uploadLimit} free resume uploads.
                  </p>
                  <a
                    href="/settings"
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-semibold transition-all shadow-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Upgrade to Pro
                  </a>
                </>
              )}

              {uploadState === 'idle' && !uploadLimitReached && (
                <>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                    isDragActive ? 'bg-[#2563EB]/10' : 'bg-[#F8FAFC] dark:bg-[#263549]'
                  }`}>
                    <UploadCloud className={`w-7 h-7 ${isDragActive ? 'text-[#2563EB]' : 'text-gray-300 dark:text-slate-600'}`} />
                  </div>
                  <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">
                    {isDragActive ? 'Drop your resume here' : 'Upload or drag & drop your resume'}
                  </p>
                  <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-1.5">PDF or Word (.doc / .docx) · Max 5 MB</p>
                  <button
                    type="button"
                    className="resume-upload-pulse mt-4 inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-semibold hover:bg-[#1E293B] dark:hover:bg-blue-700 hover:-translate-y-0.5 hover:scale-[1.02] active:scale-100 transition-all shadow-sm"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    {hasExistingResume ? 'Replace Resume' : 'Upload Resume'}
                  </button>
                </>
              )}
            </div>

            {/* RIGHT: What happens after upload */}
            <div className="resume-soft-enter rounded-xl bg-[#F8FAFC] dark:bg-[#263549] border border-[#E5E7EB] dark:border-[#334155] p-6" style={{ '--delay': '90ms' } as CSSProperties}>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-[#2563EB]" />
                <p className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F1F5F9]">What happens after upload?</p>
              </div>
              <div className="grid gap-3">
                {[
                  {
                    title: 'We read your resume',
                    body: 'AI picks up your skills, experience, education, and career direction.',
                    icon: BrainCircuit,
                  },
                  {
                    title: 'We understand your profile',
                    body: 'Your resume is converted into a structured job-search profile.',
                    icon: UserRoundSearch,
                  },
                  {
                    title: 'We find better-fit jobs',
                    body: 'FindAllJob searches and matches roles that fit your background.',
                    icon: BriefcaseBusiness,
                  },
                  {
                    title: 'You get ranked job matches',
                    body: 'Each job shows why it matches you, with a clear match score.',
                    icon: Trophy,
                  },
                ].map((step, i) => {
                  const Icon = step.icon
                  return (
                    <div
                      key={step.title}
                      className="resume-soft-enter group relative flex gap-3 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-white/80 dark:bg-[#1E293B]/55 p-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_10px_30px_rgba(37,99,235,0.10)] dark:hover:border-[#2563EB]/45 dark:hover:shadow-[0_10px_30px_rgba(37,99,235,0.12)]"
                      style={{ '--delay': `${150 + i * 70}ms` } as CSSProperties}
                    >
                      {i < 3 && (
                        <div className="resume-flow-line absolute left-[22px] top-[46px] h-[calc(100%-28px)] w-px overflow-hidden bg-[#E5E7EB] dark:bg-[#334155]" style={{ '--delay': `${i * 220}ms` } as CSSProperties} />
                      )}
                      <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#2563EB] text-white shadow-sm transition-transform duration-300 group-hover:scale-[1.03]">
                        <Icon className="w-4 h-4" />
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-[#0F172A] text-[8px] font-black text-[#2563EB] border border-blue-100 dark:border-blue-900">
                          {i + 1}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-[#0F172A] dark:text-[#F1F5F9]">{step.title}</p>
                        <p className="text-[11px] leading-relaxed text-gray-500 dark:text-slate-400 mt-0.5">{step.body}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5">
                <Coffee className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-[12px] font-medium leading-relaxed text-amber-700 dark:text-amber-300">
                  This usually takes 3–5 minutes. Grab a coffee — we&apos;ll do the heavy lifting.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Country confirmation modal — centered overlay, appears after parsing ── */}
      {isCountryConfirmation && countryConfirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm">
            <CountryConfirmStep
              detectedCountryCode={countryConfirmPending.detectedCountryCode}
              detectedCountryName={countryConfirmPending.detectedCountry}
              savedPreferredCode={null}
              onConfirm={handleCountryConfirmed}
            />
          </div>
        </div>
      )}

      {/* ── Progress strip — shown during job search and on success ─────────── */}
      {busy || uploadState === 'success' ? (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(280px,0.85fr)_minmax(360px,1.15fr)] gap-5">
          <ProgressiveActivity
            title={activityFailed ? 'We saved your resume' : 'Matching your resume'}
            steps={activitySteps}
          />
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
      ) : null}

      {/* ── Empty state — only when no resume AND fully idle ─────────────── */}
      {!hasExistingResume && uploadState === 'idle' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="resume-soft-enter flex flex-col items-center justify-center min-h-[260px] bg-white dark:bg-[#1E293B] rounded-2xl border border-dashed border-[#E5E7EB] dark:border-[#334155] text-center p-8 transition-all duration-300 hover:border-blue-200 dark:hover:border-[#2563EB]/35 hover:shadow-[0_12px_34px_rgba(15,23,42,0.06)] dark:hover:shadow-[0_12px_34px_rgba(37,99,235,0.08)]">
            <div className="w-14 h-14 rounded-2xl bg-[#F8FAFC] dark:bg-[#263549] flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-gray-300 dark:text-slate-600" />
            </div>
            <p className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">No resume uploaded yet</p>
            <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1 max-w-sm">
              Upload your resume above, or let AI build one for you in 2 minutes.
            </p>
            <CreateResumeWithAI avatarUrl={avatarUrl ?? null} />
          </div>

          <div className="resume-soft-enter min-h-[260px] bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6 transition-all duration-300 hover:border-blue-200 dark:hover:border-[#2563EB]/35 hover:shadow-[0_12px_34px_rgba(15,23,42,0.06)] dark:hover:shadow-[0_12px_34px_rgba(37,99,235,0.08)]" style={{ '--delay': '120ms' } as CSSProperties}>
            <div className="flex items-start gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-[#1E3A5F] flex items-center justify-center flex-shrink-0">
                <Coins className="w-5 h-5 text-[#2563EB]" />
              </div>
              <div>
                <p className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">How AI credits work</p>
                <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                  AI credits are used when FindAllJob performs deeper AI tasks for you — like creating a resume, improving it for a job, or preparing you for an interview.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {[
                'Resume creation may use credits',
                'Resume optimization uses credits',
                'Interview preparation uses credits',
                'Viewing jobs, saved jobs, and opening job links do not use credits',
              ].map((item, i) => (
                <div key={item} className="flex items-start gap-2.5 rounded-xl bg-[#F8FAFC] dark:bg-[#263549] border border-[#E5E7EB] dark:border-[#334155] px-3 py-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white dark:hover:border-[#2563EB]/40 dark:hover:bg-[#2A3A50]">
                  {i < 3 ? (
                    <Sparkles className="w-3.5 h-3.5 text-[#2563EB] mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                  )}
                  <p className="text-[12px] font-medium leading-relaxed text-gray-600 dark:text-slate-300">{item}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-[#0F172A] dark:bg-[#263549] border border-[#0F172A] dark:border-[#334155] px-4 py-3">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                <p className="text-[12px] font-bold text-white dark:text-[#F1F5F9]">
                  Your current balance: {creditsRemaining ?? 24} AI credits left
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/40 dark:text-slate-500 flex-shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────────────────── */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !deleting && setShowConfirm(false)}
        >
          <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]" />
          <div
            className="relative w-full max-w-[420px] bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setShowConfirm(false)}
              disabled={deleting}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#263549] transition-colors disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon */}
            <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>

            <h2 className="text-[17px] font-black text-[#0F172A] dark:text-[#F1F5F9] mb-1.5">Delete this resume?</h2>
            <p className="text-[13px] text-gray-500 dark:text-slate-400 mb-3">This will permanently remove:</p>

            <ul className="space-y-1.5 mb-5">
              {[
                'Parsed resume data and profile',
                'All matched job listings and scores',
                'Optimized resume versions',
                'Interview prep progress tied to this resume',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="text-[12px] text-gray-400 dark:text-slate-500 mb-5">This action cannot be undone.</p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-600 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Deleting…</>
                  : <><Trash2 className="w-3.5 h-3.5" />Delete Resume</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
