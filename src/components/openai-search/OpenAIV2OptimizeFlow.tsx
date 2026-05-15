'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { PaywallModal } from '@/components/PaywallModal'
import { ProgressModal, STEPS_JOB } from '@/components/resume/ProgressModal'
import { ResumePreviewModal } from '@/components/resume/ResumePreviewModal'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

type Props = {
  resultId: string
  onClose: () => void
  onSaved?: () => void
  onUpgradeRequired?: () => void
  onLocalSaved?: (resultId: string, data: OptimizedResumeData) => void
}

export function OpenAIV2OptimizeFlow({ resultId, onClose, onSaved, onUpgradeRequired, onLocalSaved }: Props) {
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [upgradeRequired, setUpgradeRequired] = useState(false)
  const [result, setResult] = useState<OptimizedResumeData | null>(null)
  const [isFreePreview, setIsFreePreview] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [showDownloadUpgrade, setShowDownloadUpgrade] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultId])

  async function run() {
    setStep(1)
    setError(null)
    setUpgradeRequired(false)
    setResult(null)
    setIsFreePreview(false)
    setFromCache(false)
    setIsSaved(false)
    setShowDownloadUpgrade(false)

    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 250_000)

    try {
      await new Promise((resolve) => setTimeout(resolve, 800))
      setStep(2)

      const response = await fetch('/api/openai-search/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultId }),
        signal: controller.signal,
      })
      clearTimeout(abortTimer)

      let payload: Record<string, unknown> = {}
      try {
        payload = await response.json()
      } catch {
        setError('Optimization timed out. Please click Retry.')
        return
      }

      if (!response.ok) {
        if (payload.requiresUpgrade) {
          setUpgradeRequired(true)
          setError(payload.error as string ?? 'Upgrade to keep tailoring your resume for more jobs.')
        } else {
          setError(payload.error as string ?? 'Optimization failed. Please try again.')
        }
        return
      }

      if (payload.fromCache) {
        setFromCache(true)
        setIsFreePreview(false)
        setResult(payload.optimizedData as OptimizedResumeData)
        setIsSaved(true)
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 400))
      setStep(3)
      await new Promise((resolve) => setTimeout(resolve, 600))

      setIsFreePreview(!!payload.isFreePreview)
      setResult(payload.optimizedData as OptimizedResumeData)
    } catch (requestError) {
      clearTimeout(abortTimer)
      const isTimeout = requestError instanceof Error && (requestError.name === 'AbortError' || requestError.name === 'TimeoutError')
      setError(
        isTimeout
          ? 'Optimization took too long. Please click Retry.'
          : 'Connection failed. Please check your internet and try again.',
      )
    }
  }

  async function handleApprove(editedData?: OptimizedResumeData) {
    const dataToSave = editedData ?? result
    if (!dataToSave) return

    setIsSaving(true)
    try {
      const response = await fetch('/api/openai-search/optimize/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultId, optimizedData: dataToSave }),
      })
      const payload = await response.json()
      if (!response.ok) {
        toast.error(payload.error ?? 'Failed to save. Please try again.')
        return
      }

      toast.success('Resume optimized for this OpenAI V2 job!')
      setResult(dataToSave)
      setIsSaved(true)
      onLocalSaved?.(resultId, dataToSave)
      onSaved?.()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!mounted) return null

  const content = result ? (
    <ResumePreviewModal
      data={result}
      onClose={onClose}
      onSaveEdits={handleApprove}
      isSaving={isSaving}
      heading="Optimized Resume for This Job"
      previewSubtitle={
        fromCache
          ? 'Loaded from your saved OpenAI V2 optimization — no credits charged.'
          : isSaved
            ? 'See how AI tailored your resume for this role.'
            : 'Review and edit your AI-optimized resume before saving.'
      }
      startInEditMode={!isSaved}
      canDownload={!isFreePreview}
      isFreePreview={isFreePreview}
      isOptimizedPreview={isSaved}
      onLockedDownload={isFreePreview && isSaved ? () => setShowDownloadUpgrade(true) : undefined}
    />
  ) : (
    <ProgressModal
      step={step}
      error={error}
      steps={STEPS_JOB}
      subtitle="AI is tailoring your resume to this OpenAI V2 role"
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
    document.body,
  )
}
