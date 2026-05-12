'use client'

import { useState, useRef, useMemo } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { toast } from 'sonner'
import { Briefcase, Loader2, Sparkles, Circle } from 'lucide-react'
import { PaywallModal } from '@/components/PaywallModal'
import { InterviewModal } from '@/components/InterviewModal'
import { OptimizeFlow } from '@/components/resume/OptimizeFlow'
import { ResumePreviewModal } from '@/components/resume/ResumePreviewModal'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'
import { JobCard, type MatchRecord } from '@/components/jobs/JobCard'
import type { Application } from '@/types'

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

  const { data: appsData }      = useSWR('/api/applications', fetcher)
  const { data: matchData }     = useSWR('/api/jobs/match', fetcher)
  const { data: optimizedData } = useSWR('/api/resume/optimize', fetcher)
  const { data: profileData }   = useSWR('/api/profile', fetcher)

  const userId: string | undefined = profileData?.user_id as string | undefined

  // Build a job-id → MatchRecord lookup from current AI match results
  const matchByJobId = useMemo(() => {
    const map = new Map<string, MatchRecord>()
    for (const m of (matchData?.matches ?? []) as MatchRecord[]) {
      if (m.job?.id) map.set(m.job.id, m)
    }
    return map
  }, [matchData])

  // Applied applications only
  const appliedApps: Application[] = useMemo(
    () => (appsData?.applications ?? []).filter((a: Application) => a.status === 'applied'),
    [appsData]
  )

  // Build MatchRecord[] — use real match data where available, synthetic otherwise
  const appliedMatches: MatchRecord[] = useMemo(() => {
    return appliedApps.map((app) => {
      const existing = matchByJobId.get(app.job.id)
      if (existing) return existing
      return {
        id: app.id,
        ai_score: 0,
        ai_reasoning: '',
        match_reasons: [],
        matched_skills: [],
        missing_skills: [],
        job: {
          id: app.job.id,
          title: app.job.title,
          company: app.job.company,
          location: app.job.location,
          url: app.job.url,
          apply_url: app.job.apply_url,
          apply_status: app.job.apply_status,
          salary: app.job.salary,
          description: app.job.description,
          source: app.job.source,
          created_at: app.job.created_at,
        },
      } satisfies MatchRecord
    })
  }, [appliedApps, matchByJobId])

  // application id per job id (for initialApplicationId)
  const appIdByJobId = useMemo(() => {
    const map = new Map<string, string>()
    for (const app of (appsData?.applications ?? []) as Application[]) {
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

  const allOptimizedByJobId = useMemo(() => {
    const map = new Map<string, { id?: string; data: OptimizedResumeData }>()
    for (const [jid, entry] of optimizedResumesByJobId) map.set(jid, entry)
    for (const [jid, data] of localOptimizedResumes) {
      if (!map.has(jid)) map.set(jid, { data })
    }
    return map
  }, [optimizedResumesByJobId, localOptimizedResumes])

  const allOptimizedJobIds = useMemo(() => new Set(allOptimizedByJobId.keys()), [allOptimizedByJobId])

  const isCurrentUserPro = profileData !== undefined && (profileData?.plan ?? 'free') !== 'free'

  function handleOptimize(jobId: string) {
    const credits       = profileData?.credits_remaining
    const OPTIMIZE_COST = 2
    if (credits != null && credits < OPTIMIZE_COST) { setShowPaywall(true); return }
    setOptimizeJobId(jobId)
  }

  function handleInterview(match: MatchRecord) {
    const credits        = profileData?.credits_remaining
    const INTERVIEW_COST = 2
    if (credits != null && credits < INTERVIEW_COST) { setShowInterviewPaywall(true); return }
    setInterviewMatch(match)
  }

  async function handleDeleteOptimized(id: string) {
    const res = await fetch(`/api/resume/optimize?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete optimized resume'); throw new Error('Delete failed') }
    toast.success('Optimized resume removed')
    globalMutate('/api/resume/optimize')
  }

  function handleLocalSaved(jobId: string, data: OptimizedResumeData) {
    setLocalOptimizedResumes(prev => { const next = new Map(prev); next.set(jobId, data); return next })
  }

  function handleClearLocalOptimized(jobId: string) {
    setLocalOptimizedResumes(prev => { const next = new Map(prev); next.delete(jobId); return next })
  }

  function handleDownloadOptimizedClick(jobId: string) {
    if (isCurrentUserPro) { setViewOptimized({ jobId, autoDownload: true }) }
    else { setShowDownloadPaywall(true) }
  }

  async function handleViewOptimizedSaveEdits(jobId: string, edited: OptimizedResumeData) {
    const res = await fetch('/api/resume/optimize/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optimizedData: edited, jobId }),
    })
    if (!res.ok) { toast.error('Failed to save changes.'); return }
    handleLocalSaved(jobId, edited)
    globalMutate('/api/resume/optimize')
    toast.success('Changes saved.')
  }

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
      {!appsData ? (
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
