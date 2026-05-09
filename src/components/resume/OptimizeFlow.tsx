'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'
import { ProgressModal, STEPS_JOB, STEPS_GENERAL } from '@/components/resume/ProgressModal'
import { ResumePreviewModal } from '@/components/resume/ResumePreviewModal'
import { PaywallModal } from '@/components/PaywallModal'

type Props = {
  mode: 'general' | 'job'
  jobId?: string
  userId?: string
  avatarUrl?: string | null
  currentScore?: number
  onClose: () => void
  redirectTo?: string
  onSaved?: () => void
  canDownload?: boolean
  onUpgradeRequired?: () => void
  onLocalSaved?: (jobId: string, data: OptimizedResumeData) => void
}

export function OptimizeFlow({ mode, jobId, userId, avatarUrl, currentScore, onClose, redirectTo, onSaved, canDownload = true, onUpgradeRequired, onLocalSaved }: Props) {
  const router = useRouter()
  const [step, setStep]                         = useState(1)
  const [error, setError]                       = useState<string | null>(null)
  const [upgradeRequired, setUpgradeReq]        = useState(false)
  const [result, setResult]                     = useState<OptimizedResumeData | null>(null)
  const [isFreePreview, setIsFreePreview]       = useState(false)
  const [fromCache, setFromCache]               = useState(false)
  const [isSaving, setIsSaving]                 = useState(false)
  const [mounted, setMounted]                   = useState(false)
  const [isSaved, setIsSaved]                   = useState(false)
  // Internal upgrade overlay — shown without closing the preview (keeps optimization state visible)
  const [showDownloadUpgrade, setShowDownloadUpgrade] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => { void run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setStep(1); setError(null); setResult(null); setUpgradeReq(false)
    setIsFreePreview(false); setFromCache(false); setIsSaved(false); setShowDownloadUpgrade(false)

    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 250_000)

    try {
      await new Promise(r => setTimeout(r, 800))
      setStep(2)

      const body = mode === 'job' && jobId
        ? { jobId }
        : { mode: 'general', currentScore: currentScore ?? 0 }

      const optRes = await fetch('/api/resume/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(abortTimer)

      let optData: Record<string, unknown> = {}
      try { optData = await optRes.json() } catch {
        setError('Optimization timed out. Please click Retry — it usually succeeds on the second attempt.')
        return
      }

      if (!optRes.ok) {
        if (optData.requiresUpgrade) {
          setUpgradeReq(true)
          setError(optData.error as string ?? 'You\'re out of AI credits. Upgrade to keep tailoring your resume for more jobs.')
        } else {
          setError(optData.error as string ?? 'Optimization failed. Please try again.')
        }
        return
      }

      // Cache hit: skip animation, go straight to result
      if (optData.fromCache) {
        setFromCache(true)
        setIsFreePreview(false)
        setResult(optData.optimizedData as OptimizedResumeData)
        return
      }

      await new Promise(r => setTimeout(r, 400))
      setStep(3)
      await new Promise(r => setTimeout(r, 600))

      setIsFreePreview(!!optData.isFreePreview)
      setResult(optData.optimizedData as OptimizedResumeData)
    } catch (err) {
      clearTimeout(abortTimer)
      const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
      setError(
        isTimeout
          ? 'Optimization took too long (>4 min). Please click Retry — it usually succeeds on the second attempt.'
          : 'Connection failed. Please check your internet and try again.'
      )
    }
  }

  // Persist edits to DB for all users (free + Pro), then transition to optimized preview
  async function handleApprove(editedData?: OptimizedResumeData) {
    const dataToSave = editedData ?? result
    if (!dataToSave) return
    setIsSaving(true)
    try {
      const saveRes = await fetch('/api/resume/optimize/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optimizedData: dataToSave,
          ...(mode === 'job' && jobId ? { jobId } : {}),
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) {
        toast.error(saveData.error ?? 'Failed to save. Please try again.')
        return
      }
      toast.success(mode === 'general' ? 'Resume improved! Re-analyzing your matches…' : 'Resume optimized for this job!')
      if (typeof window !== 'undefined') localStorage.removeItem(userId ? `lastAnalyzedAt:${userId}` : 'lastAnalyzedAt')
      if (mode === 'job') {
        setResult(dataToSave)
        setIsSaved(true)
        // Optimistic card update — fires before SWR re-fetch resolves
        if (jobId) onLocalSaved?.(jobId, dataToSave)
      }
      onSaved?.()
      if (mode === 'general') {
        onClose()
        router.push(redirectTo ?? '/matches')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!mounted) return null

  const isJob = mode === 'job'

  const content = result ? (
    <ResumePreviewModal
      data={result}
      onClose={onClose}
      onSaveEdits={isJob ? handleApprove : (isFreePreview ? undefined : handleApprove)}
      isSaving={isSaving}
      avatarUrl={avatarUrl}
      heading={isJob ? 'Optimized Resume for This Job' : 'Preview Improved Resume'}
      previewSubtitle={isJob
        ? (fromCache
            ? 'Loaded from your saved optimization — no credits charged.'
            : isSaved
              ? 'See how AI tailored your resume for this role.'
              : 'Review and edit your AI-optimized resume before saving.')
        : 'Enhancing clarity, impact, and ATS performance'}
      startInEditMode={isJob && !isSaved}
      canDownload={canDownload && !isFreePreview}
      isFreePreview={isFreePreview}
      isOptimizedPreview={isJob && isSaved}
      onLockedDownload={isJob && isFreePreview && isSaved ? () => setShowDownloadUpgrade(true) : undefined}
      {...(!isJob && !isFreePreview && { onApprove: () => handleApprove(), approveLabel: 'Accept & Done' })}
    />
  ) : (
    <ProgressModal
      step={step}
      error={error}
      steps={isJob ? STEPS_JOB : STEPS_GENERAL}
      subtitle={isJob ? 'AI is tailoring your resume to this role' : 'Improving your resume'}
      onRetry={run}
      onClose={onClose}
      onUpgrade={upgradeRequired ? () => { onClose(); onUpgradeRequired?.() } : undefined}
    />
  )

  return createPortal(
    <>
      {content}
      {showDownloadUpgrade && (
        <PaywallModal
          onClose={() => setShowDownloadUpgrade(false)}
          onMaybeLater={() => setShowDownloadUpgrade(false)}
        />
      )}
    </>,
    document.body
  )
}
