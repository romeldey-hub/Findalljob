'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Wand2, Download, Loader2, Building2, Sparkles,
  MapPin, Briefcase, Eye, Mic,
  Plus, Trash2, UserCheck,
  Bookmark, BookmarkCheck,
} from 'lucide-react'
import { InterviewModal } from '@/components/InterviewModal'
import { ResumePreviewModal } from '@/components/resume/ResumePreviewModal'
import { ApplyButton, sourceLabel } from '@/components/jobs/ApplyButton'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { resolveAvatar } from '@/lib/avatar'
import { toDataUri } from '@/lib/utils'
import { useCountUp, useAnimate } from '@/lib/useAnimations'

const fetcher = (url: string) => fetch(url).then(r => r.json())

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProcessedResume {
  id: string
  jobId: string
  jobTitle: string
  company: string
  location: string
  description: string
  applyUrl: string
  source?: string
  salary?: string | null
  createdAt: string
  optimizedData: OptimizedResumeData
}

interface RawSavedResume {
  id: string
  job_id: string | null
  optimized_text: string
  created_at: string
  jobs: { title: string; company: string; location: string; description: string; url: string; salary?: string; source?: string } | null
}

function parseRaw(r: RawSavedResume): ProcessedResume {
  return {
    id: r.id,
    jobId: r.job_id ?? '',
    jobTitle: r.jobs?.title ?? 'Optimized Resume',
    company: r.jobs?.company ?? '',
    location: r.jobs?.location ?? '',
    description: r.jobs?.description ?? '',
    applyUrl: r.jobs?.url ?? '',
    source: r.jobs?.source,
    salary: r.jobs?.salary,
    createdAt: r.created_at,
    optimizedData: JSON.parse(r.optimized_text) as OptimizedResumeData,
  }
}

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

function extractJobType(text: string): string {
  const t = text.toLowerCase()
  if (/\bcontract\b|\bfreelance\b|\bcontractor\b/.test(t)) return 'Contract'
  if (/\bpart[-\s]?time\b/.test(t)) return 'Part-time'
  return 'Full-time'
}

function formatOptimizationNote(note: string) {
  return note.trim().replace(/^[•\-\s]+/, '').replace(/[.。]+$/, '')
}

function keywordEnhancement(keyword: string) {
  return `Strengthened ${keyword} positioning`
}

// ── ATS Score Ring ────────────────────────────────────────────────────────────

function ATSScoreRing({ score, originalScore }: { score: number; originalScore?: number | null }) {
  const r      = 28
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ

  const ringColor = score >= 80 ? '#16A34A' : score >= 60 ? '#2563EB' : score >= 20 ? '#D97706' : '#9CA3AF'
  const tierLabel = score >= 80 ? 'Strong Match' : score >= 60 ? 'Good Match' : score >= 20 ? 'Fair Match' : 'Weak'
  const tierColor = score >= 80 ? 'text-green-600 dark:text-green-500' : score >= 60 ? 'text-blue-600 dark:text-blue-400' : score >= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'
  const hasImproved = originalScore != null && originalScore < score

  const animated     = useAnimate()
  const displayScore = useCountUp(score, 900)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[64px] h-[64px] flex items-center justify-center">
        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 absolute inset-0">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#F1F5F9" strokeWidth="4.5" className="dark:stroke-[#334155]" />
          <circle
            cx="32" cy="32" r={r}
            fill="none" stroke={ringColor} strokeWidth="4.5" strokeLinecap="round"
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
      {hasImproved
        ? <span className="text-[9px] font-semibold text-green-500 dark:text-green-400 text-center leading-tight">↑ {originalScore} → {score}</span>
        : <span className="text-[9px] text-gray-400 dark:text-slate-500 text-center leading-tight">ATS Score</span>
      }
    </div>
  )
}

// ── Optimized Job Card ────────────────────────────────────────────────────────

function OptimizedJobCard({
  resume,
  saved,
  saving,
  onViewResume,
  onDownload,
  onDelete,
  onToggleSave,
  onInterview,
}: {
  resume: ProcessedResume
  saved: boolean
  saving: boolean
  onViewResume: () => void
  onDownload: () => void
  onDelete: () => void
  onToggleSave?: () => void
  onInterview?: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { optimizedData: d, jobTitle, company, location, applyUrl, source } = resume
  const optimizationReasons = (d.improvements?.length
    ? d.improvements.map((item) => formatOptimizationNote(item.note))
    : (d.matched_keywords ?? []).map(keywordEnhancement)
  ).filter(Boolean).slice(0, 4)
  const contextTags = (d.matched_keywords ?? []).slice(0, 3)
  const extraContextTags = Math.max(0, (d.matched_keywords?.length ?? 0) - 3)
  const expLabel = extractExperience(resume.description || '', jobTitle)
  const jobType = extractJobType(resume.description || '')
  const src = sourceLabel(source)

  const primaryBtn     = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-[11px] font-semibold transition-all hover:shadow-sm active:scale-[0.99]'
  const secondaryBtn   = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[11px] font-medium text-gray-500 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-all'
  const blueOutlineBtn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-[11px] font-medium text-blue-400 dark:text-blue-500 hover:border-blue-500 dark:hover:border-blue-500 hover:text-[#2563EB] dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all'

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm hover:-translate-y-[2px] hover:shadow-[0_6px_24px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out p-4 sm:p-5">

      <div className="flex gap-4">

        {/* ── MAIN CONTENT ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Job title */}
          <h3 className="font-bold text-[16px] sm:text-[17px] leading-snug text-[#0F172A] dark:text-[#F1F5F9] mb-1">
            {jobTitle}
          </h3>

          {/* Meta row */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-gray-400 dark:text-slate-500 mb-3">
            {company && (
              <span className="font-semibold text-gray-600 dark:text-slate-300 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-gray-400 dark:text-slate-500 flex-shrink-0" />{company}
              </span>
            )}
            {location && (
              <>
                {company && <span className="text-gray-200 dark:text-slate-700">·</span>}
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />{location}
                </span>
              </>
            )}
            {(company || location) && <span className="text-gray-200 dark:text-slate-700">·</span>}
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
            {resume.salary && (
              <>
                <span className="text-gray-200 dark:text-slate-700">·</span>
                <span className="font-medium text-gray-500 dark:text-slate-400">{resume.salary}</span>
              </>
            )}
          </div>

          {/* ── What was improved for this role ──────────────────── */}
          {optimizationReasons.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-slate-500">
                What was improved for this role
              </p>
              <div className="space-y-0.5">
                {optimizationReasons.map((reason) => (
                  <div key={reason} className="flex items-start gap-1.5">
                    <span className="text-green-500 dark:text-green-400 text-[11px] leading-[1.6] flex-shrink-0 mt-px">✔</span>
                    <span className="text-[12px] text-gray-600 dark:text-slate-300 leading-[1.6]">{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Lightweight context tags ────────────────────────── */}
          {contextTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mb-4">
              {contextTags.map((tag: string, i: number) => (
                <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md border border-slate-200 dark:border-[#334155] text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-[#263549]/50 cursor-default select-none">
                  {tag}
                </span>
              ))}
              {extraContextTags > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-[#E5E7EB] dark:border-[#334155] text-[10px] font-medium text-gray-400 dark:text-slate-500 cursor-default select-none">
                  +{extraContextTags} more
                </span>
              )}
            </div>
          )}

          {/* Button row */}
          {confirmDelete ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] text-red-500 dark:text-red-400">Delete this resume?</span>
              <button onClick={() => setConfirmDelete(false)} className={secondaryBtn}>Cancel</button>
              <button
                onClick={() => { setConfirmDelete(false); onDelete() }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[11px] font-bold transition-colors"
              >
                Yes, delete
              </button>
            </div>
          ) : (
            <div className="flex items-center flex-wrap gap-2">
              {onInterview && (
                <button onClick={onInterview} className={blueOutlineBtn}>
                  <Mic className="w-3 h-3" />Prepare For This Interview
                </button>
              )}
              <button onClick={onViewResume} className={secondaryBtn}>
                <Eye className="w-3.5 h-3.5" />View Resume
              </button>
              <button onClick={onDownload} className={secondaryBtn}>
                <Download className="w-3.5 h-3.5" />Download
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center p-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-gray-400 dark:text-slate-500 hover:border-red-200 dark:hover:border-red-800 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Delete optimized resume"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── ACTION PANEL (right column) ───────────────────────── */}
        <div className="flex flex-col flex-shrink-0 pl-4 border-l border-[#F1F5F9] dark:border-[#334155]">

          {/* Bookmark — top right of panel */}
          <div className="flex justify-end mb-2">
            {onToggleSave ? (
              <button
                onClick={onToggleSave}
                disabled={saving}
                title={saved ? 'Remove from tracker' : 'Save to tracker'}
                className="text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 transition-colors disabled:opacity-50"
              >
                {saving
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : saved
                  ? <BookmarkCheck className="w-3.5 h-3.5 text-[#2563EB]" />
                  : <Bookmark className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <div className="w-3.5 h-3.5" />
            )}
          </div>

          {/* Score ring — top aligned */}
          <div className="flex flex-col items-center">
            <ATSScoreRing score={d.ats_score} originalScore={d.original_score} />
          </div>

          {/* Source + CTA — anchored to bottom */}
          <div className="flex flex-col items-center gap-2 mt-auto">
            {src && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#F1F5F9] dark:bg-[#263549] text-gray-400 dark:text-slate-500 border border-[#E5E7EB] dark:border-[#334155] whitespace-nowrap">
                {src}
              </span>
            )}
            <ApplyButton
              job={{ id: resume.jobId || resume.id, title: jobTitle, company, url: applyUrl, source }}
              variant="primary"
            />
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Main content ──────────────────────────────────────────────────────────────

function OptimizerContent() {
  const router = useRouter()

  const [previewResume, setPreviewResume]   = useState<OptimizedResumeData | null>(null)
  const [interviewResume, setInterviewResume] = useState<ProcessedResume | null>(null)
  const [, setDownloading]                  = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl]           = useState<string | null>(null)
  const [savingJobId, setSavingJobId]       = useState<string | null>(null)

  const { data: profileData }       = useSWR('/api/profile', fetcher)
  const { data: savedData, mutate } = useSWR('/api/resume/optimize', fetcher)
  const { data: appsData }          = useSWR('/api/applications', fetcher)

  const isPro = profileData?.plan === 'pro'

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

  useEffect(() => {
    const supabase = createBrowserClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', user.id)
        .single()
      setAvatarUrl(resolveAvatar(profile, user))
    })
  }, [])

  const allResumes: ProcessedResume[] = useMemo(() => {
    return (savedData?.resumes ?? []).map((r: RawSavedResume) => parseRaw(r))
  }, [savedData])

  async function handleToggleSave(jobId: string) {
    if (!jobId || savingJobId) return
    setSavingJobId(jobId)
    try {
      const appId = savedJobToAppId.get(jobId)
      if (appId) {
        const res = await fetch(`/api/applications?id=${appId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        toast.success('Removed from tracker')
      } else {
        const res = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, status: 'saved' }),
        })
        if (!res.ok) throw new Error()
        toast.success('Saved to tracker')
      }
      globalMutate('/api/applications')
    } catch {
      toast.error('Failed to update tracker')
    } finally {
      setSavingJobId(null)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/resume/optimize?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json()
        toast.error(error ?? 'Failed to delete.')
        return
      }
      await mutate()
      toast.success('Resume deleted.')
    } catch {
      toast.error('Failed to delete. Please try again.')
    }
  }

  async function handleDownload(resume: ProcessedResume) {
    setDownloading(resume.id)
    try {
      const [pdfAvatarUrl, { pdf }, { createElement }, { ResumePDF }] = await Promise.all([
        avatarUrl ? toDataUri(avatarUrl) : Promise.resolve(null),
        import('@react-pdf/renderer'),
        import('react'),
        import('@/components/resume/ResumePDF'),
      ])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await (pdf as any)(createElement(ResumePDF, { data: resume.optimizedData, avatarUrl: pdfAvatarUrl } as any) as any).toBlob()
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), {
        href: url,
        download: `${(resume.optimizedData.name || 'resume').replace(/\s+/g, '_')}_${resume.jobTitle.replace(/\s+/g, '_')}.pdf`,
      })
      document.body.appendChild(a); a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded!')
    } catch (err) {
      console.error('[optimizer] PDF failed:', err)
      toast.error('PDF generation failed.')
    } finally {
      setDownloading(null)
    }
  }

  const isDataLoaded = savedData !== undefined

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2 leading-tight">
          Resume Optimizer
          <Sparkles className="w-4 h-4 text-amber-400" />
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">
          View and manage your AI-optimized resumes.
        </p>
      </div>

      {/* ── Loading skeleton ─────────────────────────────────────── */}
      {!isDataLoaded && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300 dark:text-slate-600" />
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {isDataLoaded && allResumes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-[#1E293B] rounded-2xl border border-dashed border-[#E5E7EB] dark:border-[#334155] text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F8FAFC] dark:bg-[#263549] flex items-center justify-center mb-4">
            <Wand2 className="w-6 h-6 text-gray-300 dark:text-slate-600" />
          </div>
          <p className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">No optimized resumes yet</p>
          <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1 max-w-[300px]">
            Go to{' '}
            <a href="/matches" className="text-[#2563EB] font-semibold hover:underline">Matched Jobs</a>
            {' '}and click &ldquo;Optimize for this job&rdquo; on any listing.
          </p>
        </div>
      )}

      {/* ── Results layout ───────────────────────────────────────── */}
      {isDataLoaded && allResumes.length > 0 && (
        <div className="space-y-5">
          <div>
            <h2 className="font-bold text-[17px] text-[#0F172A] dark:text-[#F1F5F9]">Optimized Resumes</h2>
            <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">
              View and manage your AI-optimized resumes for different jobs.
            </p>
          </div>
          <div className="space-y-4">
            {allResumes.map((resume) => (
              <OptimizedJobCard
                key={resume.id}
                resume={resume}
                saved={savedJobIds.has(resume.jobId)}
                saving={savingJobId === resume.jobId}
                onToggleSave={resume.jobId ? () => handleToggleSave(resume.jobId) : undefined}
                onViewResume={() => setPreviewResume(resume.optimizedData)}
                onDownload={() => handleDownload(resume)}
                onDelete={() => handleDelete(resume.id)}
                onInterview={() => setInterviewResume(resume)}
              />
            ))}
          </div>
          <button
            onClick={() => router.push('/matches')}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-400 dark:text-slate-500 hover:border-[#2563EB]/50 hover:text-[#2563EB] dark:hover:text-blue-400 hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] transition-all"
          >
            <Plus className="w-4 h-4" />Optimize for Another Job
          </button>
        </div>
      )}

      {/* ── View saved resume ─────────────────────────────────────── */}
      {previewResume && (
        <ResumePreviewModal
          data={previewResume}
          onClose={() => setPreviewResume(null)}
          avatarUrl={avatarUrl}
          onSaveEdits={(edited) => setPreviewResume(edited)}
        />
      )}

      {/* ── Mock interview ───────────────────────────────────────── */}
      {interviewResume && (
        <InterviewModal
          job={{
            id:          interviewResume.jobId || 'resume',
            title:       interviewResume.jobTitle || interviewResume.optimizedData.experience?.[0]?.title || 'General Practice',
            company:     interviewResume.company,
            description: interviewResume.description,
          }}
          isPro={isPro}
          mode={interviewResume.jobId ? 'job-based' : 'resume'}
          onClose={() => setInterviewResume(null)}
        />
      )}
    </div>
  )
}

export default function OptimizerPage() {
  return <OptimizerContent />
}
