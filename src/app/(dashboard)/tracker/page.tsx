'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { toast } from 'sonner'
import { Briefcase, Loader2, Sparkles, Circle } from 'lucide-react'
import { PaywallModal } from '@/components/PaywallModal'
import { InterviewModal } from '@/components/InterviewModal'
import { OptimizeFlow } from '@/components/resume/OptimizeFlow'
import { ResumePreviewModal } from '@/components/resume/ResumePreviewModal'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'
import { JobCard, type MatchRecord } from '@/components/jobs/JobCard'
import { appliedJobToMatch, type AppliedJobRow } from '@/lib/applied-jobs'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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

// ── AppliedJobsPage ───────────────────────────────────────────────────────────

export default function AppliedJobsPage() {
  const [interviewMatch, setInterviewMatch]         = useState<MatchRecord | null>(null)
  const [optimizeJobId, setOptimizeJobId]           = useState<string | null>(null)
  const [celebratingJobId, setCelebratingJobId]     = useState<string | null>(null)
  const pendingCelebrationRef                       = useRef<string | null>(null)
  const [viewOptimized, setViewOptimized]           = useState<{ jobId: string; autoDownload?: boolean } | null>(null)
  const [deleteConfirmJobId, setDeleteConfirmJobId] = useState<string | null>(null)
  const [showPaywall, setShowPaywall]               = useState(false)
  const [showInterviewPaywall, setShowInterviewPaywall] = useState(false)
  const [showDownloadPaywall, setShowDownloadPaywall]   = useState(false)
  const [localOptimizedResumes, setLocalOptimizedResumes] = useState<Map<string, OptimizedResumeData>>(() => new Map())

  const { data: appliedData } = useSWR('/api/applied-jobs', fetcher)
  const { data: profileData } = useSWR('/api/profile', fetcher)
  const { data: optimizedData } = useSWR('/api/resume/optimize', fetcher)

  const userId: string | undefined = profileData?.user_id as string | undefined

  const appliedJobs: AppliedJobRow[] = useMemo(
    () => appliedData?.appliedJobs ?? [],
    [appliedData]
  )

  // Applied Jobs renders exclusively from applied_jobs snapshots.
  // It does not read job_matches, active resume data, search results, or live job sources.
  const appliedMatches: MatchRecord[] = useMemo(() => {
    return appliedJobs.map(appliedJobToMatch)
  }, [appliedJobs])

  const optimizedResumesByJobId = useMemo(() => {
    const map = new Map<string, { id: string; data: OptimizedResumeData }>()
    for (const r of (optimizedData?.resumes ?? [])) {
      if (!r.job_id || !r.optimized_text) continue
      try {
        map.set(r.job_id, { id: r.id, data: JSON.parse(r.optimized_text) as OptimizedResumeData })
      } catch { /* malformed optimized resume — skip */ }
    }
    return map
  }, [optimizedData])

  // application id per job id (for initialApplicationId)
  const appIdByJobId = useMemo(() => {
    const map = new Map<string, string>()
    for (const app of appliedJobs) {
      if (app.original_job_id && app.application_id) map.set(app.original_job_id, app.application_id)
    }
    return map
  }, [appliedJobs])

  const allOptimizedByJobId = useMemo(() => {
    const map = new Map<string, { id?: string; data: OptimizedResumeData }>()
    // 2. Local state (just-completed optimize flow in this session)
    for (const [jid, data] of localOptimizedResumes) map.set(jid, { data })
    // 3. Existing optimized resume rows — copied into applied_jobs below when missing.
    for (const [jid, entry] of optimizedResumesByJobId) {
      if (!map.has(jid)) map.set(jid, entry)
    }
    // 1. Permanent applied_jobs snapshot — always wins, survives resume deletion.
    for (const app of appliedJobs) {
      const jobId = app.original_job_id
      if (!jobId || !app.optimized_resume_snapshot) continue
      map.set(jobId, { data: app.optimized_resume_snapshot })
    }
    return map
  }, [localOptimizedResumes, optimizedResumesByJobId, appliedJobs])

  const allOptimizedJobIds = useMemo(() => new Set(allOptimizedByJobId.keys()), [allOptimizedByJobId])

  const isCurrentUserPro = profileData !== undefined && (profileData?.plan ?? 'free') !== 'free'
  const hasMainResume = profileData === undefined ? true : Boolean(profileData?.has_resume)

  useEffect(() => {
    if (!appliedJobs.length || optimizedResumesByJobId.size === 0) return

    for (const app of appliedJobs) {
      const jobId = app.original_job_id
      if (!jobId || app.optimized_resume_snapshot) continue
      const optimized = optimizedResumesByJobId.get(jobId)
      if (!optimized) continue
      void fetch('/api/applied-jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, optimizedSnapshot: optimized.data }),
      })
        .then((res) => { if (res.ok) globalMutate('/api/applied-jobs') })
        .catch(() => { /* non-blocking persistence backfill */ })
    }
  }, [appliedJobs, optimizedResumesByJobId])

  function handleOptimize(jobId: string) {
    if (!hasMainResume) return
    const credits       = profileData?.credits_remaining
    const OPTIMIZE_COST = 2
    if (credits != null && credits < OPTIMIZE_COST) { setShowPaywall(true); return }
    setOptimizeJobId(jobId)
  }

  function handleInterview(match: MatchRecord) {
    if (!hasMainResume) return
    const credits        = profileData?.credits_remaining
    const INTERVIEW_COST = 2
    if (credits != null && credits < INTERVIEW_COST) { setShowInterviewPaywall(true); return }
    setInterviewMatch(match)
  }

  async function handleDeleteOptimized(jobId: string) {
    const res = await fetch('/api/applied-jobs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, removeOptimizedSnapshot: true }),
    })
    if (!res.ok) { toast.error('Failed to delete optimized resume'); throw new Error('Delete failed') }
    toast.success('Optimized resume removed')
    globalMutate('/api/applied-jobs')
  }

  function handleLocalSaved(jobId: string, data: OptimizedResumeData) {
    setLocalOptimizedResumes(prev => { const next = new Map(prev); next.set(jobId, data); return next })
    fetch('/api/applied-jobs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, optimizedSnapshot: data }),
    })
      .then((res) => { if (res.ok) globalMutate('/api/applied-jobs') })
      .catch(() => { /* non-blocking; local preview still works */ })
  }

  function handleClearLocalOptimized(jobId: string) {
    setLocalOptimizedResumes(prev => { const next = new Map(prev); next.delete(jobId); return next })
  }

  function handleDownloadOptimizedClick(jobId: string) {
    if (isCurrentUserPro) { setViewOptimized({ jobId, autoDownload: true }) }
    else { setShowDownloadPaywall(true) }
  }

  async function handleViewOptimizedSaveEdits(jobId: string, edited: OptimizedResumeData) {
    const res = await fetch('/api/applied-jobs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optimizedSnapshot: edited, jobId }),
    })
    if (!res.ok) { toast.error('Failed to save changes.'); return }
    handleLocalSaved(jobId, edited)
    globalMutate('/api/applied-jobs')
    toast.success('Changes saved.')
  }

  async function handleConfirmDelete(jobId: string) {
    const entry = allOptimizedByJobId.get(jobId)
    if (!entry) return
    try { await handleDeleteOptimized(jobId) } catch { /* error toasted inside */ }
    handleClearLocalOptimized(jobId)
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2 leading-tight">
          Applied Jobs
          <Sparkles className="w-4 h-4 text-green-400" />
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">
          Jobs you have marked as Applied.
        </p>
      </div>

      {/* Count bar */}
      {appliedMatches.length > 0 && (
        <div className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-slate-500">
          <Briefcase className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
          <span className="font-bold text-[#0F172A] dark:text-[#F1F5F9]">{appliedMatches.length}</span>
          <span className="text-gray-400 dark:text-slate-500">applied {appliedMatches.length === 1 ? 'job' : 'jobs'}</span>
        </div>
      )}

      {/* Job cards */}
      {!appliedData ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300 dark:text-slate-600" />
        </div>
      ) : appliedMatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] flex items-center justify-center">
            <Circle className="w-5 h-5 text-gray-300 dark:text-slate-600" />
          </div>
          <p className="text-[14px] font-semibold text-gray-400 dark:text-slate-500">No applied jobs yet.</p>
          <p className="text-[12px] text-gray-300 dark:text-slate-600">
            Mark jobs as Applied from the Matched Jobs page.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {appliedMatches.map((match, i) => {
            const jobId       = match.job.id
            const optimized   = allOptimizedByJobId.get(jobId)
            const isOptimized = allOptimizedJobIds.has(jobId)
            const appId       = appIdByJobId.get(jobId)
            return (
              <JobCard
                key={jobId}
                match={match}
                animIndex={i}
                initialSaved={true}
                initialApplicationId={appId}
                initialIsApplied={true}
                isOptimized={isOptimized}
                isManual={match.job.source === 'manual'}
                celebrate={celebratingJobId === jobId}
                optimizedScore={optimized?.data?.ats_score}
                optimizedData={optimized?.data ?? null}
                disableResumeActions={!hasMainResume}
                onOptimize={handleOptimize}
                onInterview={handleInterview}
                onViewOptimized={() => setViewOptimized({ jobId })}
                onDownloadOptimized={() => handleDownloadOptimizedClick(jobId)}
                onDeleteRequest={() => setDeleteConfirmJobId(jobId)}
              />
            )
          })}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

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
            globalMutate('/api/applied-jobs')
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

      {(() => {
        if (!viewOptimized) return null
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
    </div>
  )
}
