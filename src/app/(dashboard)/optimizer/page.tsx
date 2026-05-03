'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Wand2, Download, Loader2, Building2, ExternalLink, Sparkles,
  MapPin, Clock, Briefcase, Eye, Mic,
  Calendar, Plus, Check, Trash2,
  Bookmark, BookmarkCheck,
} from 'lucide-react'
import { InterviewModal } from '@/components/InterviewModal'
import { ResumePreviewModal } from '@/components/resume/ResumePreviewModal'
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
  salary?: string | null
  createdAt: string
  optimizedData: OptimizedResumeData
}

interface RawSavedResume {
  id: string
  job_id: string | null
  optimized_text: string
  created_at: string
  jobs: { title: string; company: string; location: string; description: string; url: string; salary?: string } | null
}

function parseRaw(r: RawSavedResume): ProcessedResume {
  return {
    id: r.id,
    jobId: r.job_id ?? '',
    jobTitle: r.jobs?.title ?? (r.job_id ? 'Unknown Job' : 'General Improvement'),
    company: r.jobs?.company ?? '',
    location: r.jobs?.location ?? '',
    description: r.jobs?.description ?? '',
    applyUrl: r.jobs?.url ?? '',
    salary: r.jobs?.salary,
    createdAt: r.created_at,
    optimizedData: JSON.parse(r.optimized_text) as OptimizedResumeData,
  }
}

// ── ATS Score Ring ────────────────────────────────────────────────────────────

function ATSScoreRing({ score }: { score: number }) {
  const r      = 36
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color  = score >= 80 ? '#16A34A' : score >= 60 ? '#2563EB' : '#D97706'
  const label  = score >= 80 ? 'Strong Match' : score >= 60 ? 'Good Match' : 'Fair Match'

  const animated     = useAnimate()
  const displayScore = useCountUp(score, 900)

  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
      <div className="relative w-[84px] h-[84px] flex items-center justify-center">
        <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90 absolute inset-0">
          <circle cx="42" cy="42" r={r} fill="none" stroke="#F1F5F9" strokeWidth="7" />
          <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeLinecap="round"
            style={{
              strokeDasharray: circ,
              strokeDashoffset: animated ? circ - filled : circ,
              transition: animated ? 'stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)' : 'none',
            }}
          />
        </svg>
        <div className="relative z-10 text-center">
          <div className="text-[22px] font-black leading-none" style={{ color }}>{displayScore}</div>
          <div className="text-[8px] font-bold tracking-[0.08em] uppercase text-gray-400 dark:text-slate-500 mt-0.5">Score</div>
        </div>
      </div>
      <span className="text-[11px] font-bold text-center" style={{ color }}>{label}</span>
    </div>
  )
}

// ── Optimized Job Card ────────────────────────────────────────────────────────

function OptimizedJobCard({
  resume,
  isActive,
  saved,
  saving,
  onViewResume,
  onDownload,
  onDelete,
  onToggleSave,
  onInterview,
}: {
  resume: ProcessedResume
  isActive: boolean
  saved: boolean
  saving: boolean
  onViewResume: () => void
  onDownload: () => void
  onDelete: () => void
  onToggleSave?: () => void
  onInterview?: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { optimizedData: d, jobTitle, company, location, description, applyUrl, createdAt } = resume
  const tags     = (d.matched_keywords ?? []).slice(0, 5)
  const extraTags = Math.max(0, (d.matched_keywords?.length ?? 0) - 5)
  const savedDate = new Date(createdAt).toLocaleString('en-US', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm hover:shadow-md transition-all duration-200 p-6">

      {/* Top row: meta + score ring + bookmark */}
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[17px] text-[#0F172A] dark:text-[#F1F5F9] leading-snug mb-1.5">{jobTitle}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-400 dark:text-slate-500 mb-3">
            <span className="font-semibold text-gray-600 dark:text-slate-300 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-gray-400 dark:text-slate-500" />{company}
            </span>
            {location && <>
              <span className="text-gray-200 dark:text-slate-700">·</span>
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{location}</span>
            </>}
            <span className="text-gray-200 dark:text-slate-700">·</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Posted recently</span>
            <span className="text-gray-200 dark:text-slate-700">·</span>
            <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />Full-time</span>
          </div>
          {description && (
            <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed line-clamp-2 mb-4">
              {description}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 flex flex-col items-center gap-2 pt-1">
          {onToggleSave && (
            <button
              onClick={onToggleSave}
              disabled={saving}
              title={saved ? 'Remove from tracker' : 'Save to tracker'}
              className="self-end text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : saved
                ? <BookmarkCheck className="w-4 h-4 text-[#2563EB] hover:text-red-400 transition-colors" />
                : <Bookmark className="w-4 h-4" />}
            </button>
          )}
          <ATSScoreRing score={d.ats_score} />
          {d.original_score != null && d.original_score < d.ats_score && (
            <div className="flex flex-col items-center gap-1 mt-1.5">
              <span className="text-[10px] font-semibold text-green-500 dark:text-green-400">Improved from previous score</span>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-gray-400 dark:text-slate-500">Previous: <span className="font-bold">{d.original_score}</span></span>
                <span className="text-green-500 font-black">→ {d.ats_score}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Key focus tags */}
      {tags.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2">Key Focus Areas</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <span key={i} className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#E5E7EB] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#263549] text-gray-600 dark:text-slate-400">
                {tag}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#E5E7EB] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#263549] text-gray-400 dark:text-slate-500">
                +{extraTags} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bottom: timestamp + actions */}
      <div className="flex items-center justify-between pt-4 border-t border-[#F1F5F9] dark:border-[#334155] flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
          <span className="text-[12px] text-gray-400 dark:text-slate-500">Saved on {savedDate}</span>
          {isActive && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
              Active (Latest)
            </span>
          )}
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-red-500 dark:text-red-400">Delete this resume?</span>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmDelete(false); onDelete() }}
              className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[12px] font-bold transition-colors"
            >
              Yes, delete
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-gray-400 dark:text-slate-500 hover:border-red-200 dark:hover:border-red-800 hover:text-red-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Delete optimized resume"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onViewResume} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors">
              <Eye className="w-3.5 h-3.5" />View Resume
            </button>
            <button onClick={onDownload} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors">
              <Download className="w-3.5 h-3.5" />Download
            </button>
            {onInterview && (
              <button onClick={onInterview} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white text-[12px] font-semibold shadow-sm hover:opacity-90 active:opacity-100 hover:shadow-md transition-all hover:scale-[1.02] active:scale-100">
                <Mic className="w-3.5 h-3.5" />Mock Interview
              </button>
            )}
            {applyUrl && (
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-gray-500 dark:text-slate-400 text-[12px] font-medium hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-[#475569] hover:text-gray-700 dark:hover:text-slate-300 transition-all hover:scale-[1.01]"
              >
                Apply Now <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main content ──────────────────────────────────────────────────────────────

function OptimizerContent() {
  const router = useRouter()

  const [previewResume, setPreviewResume]   = useState<OptimizedResumeData | null>(null)
  const [interviewResume, setInterviewResume] = useState<ProcessedResume | null>(null)
  const [downloading, setDownloading]       = useState<string | null>(null)
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
                isActive={resume.id === allResumes[0].id}
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
