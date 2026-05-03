'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'
import { ProgressModal, STEPS_JOB, STEPS_GENERAL } from '@/components/resume/ProgressModal'
import { ResumePreviewModal } from '@/components/resume/ResumePreviewModal'

type Props = {
  mode: 'general' | 'job'
  jobId?: string
  avatarUrl?: string | null
  onClose: () => void
  redirectTo?: string
}

export function OptimizeFlow({ mode, jobId, avatarUrl, onClose, redirectTo }: Props) {
  const router = useRouter()
  const [step, setStep]         = useState(1)
  const [error, setError]       = useState<string | null>(null)
  const [result, setResult]     = useState<OptimizedResumeData | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [mounted, setMounted]   = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => { void run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setStep(1); setError(null); setResult(null)

    // Abort the request if it takes longer than 150 s (3 Claude calls × ~45 s each)
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 250_000)

    try {
      await new Promise(r => setTimeout(r, 800))
      setStep(2)

      const body = mode === 'job' && jobId
        ? { jobId }
        : { mode: 'general' }

      const optRes = await fetch('/api/resume/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(abortTimer)

      let optData: Record<string, unknown> = {}
      try { optData = await optRes.json() } catch {
        // Non-JSON body (e.g. Vercel 504 HTML)
        setError('Optimization timed out. Please click Retry — it usually succeeds on the second attempt.')
        return
      }

      if (!optRes.ok) {
        setError(optData.error as string ?? 'Optimization failed. Please try again.')
        return
      }

      await new Promise(r => setTimeout(r, 400))
      setStep(3)
      await new Promise(r => setTimeout(r, 600))

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
      toast.success(mode === 'general' ? 'Resume improved! Re-analyzing your matches…' : 'Resume optimized! Re-analyzing your matches…')
      // Clear the guard so the matches page auto-triggers a fresh analysis with the updated resume
      if (typeof window !== 'undefined') localStorage.removeItem('lastAnalyzedAt')
      onClose()
      router.push('/matches')
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
      onApprove={() => handleApprove()}
      onSaveEdits={handleApprove}
      isSaving={isSaving}
      avatarUrl={avatarUrl}
      heading={isJob ? 'Preview Optimized Resume' : 'Preview Improved Resume'}
      previewSubtitle={isJob
        ? 'Review the AI-optimized version of your resume for this job.'
        : 'Enhancing clarity, impact, and ATS performance'}
      approveLabel={isJob ? 'Approve & Save' : 'Accept & Done'}
    />
  ) : (
    <ProgressModal
      step={step}
      error={error}
      steps={isJob ? STEPS_JOB : STEPS_GENERAL}
      subtitle={isJob ? 'AI is tailoring your resume to this role' : 'Improving your resume'}
      onRetry={run}
      onClose={onClose}
    />
  )

  return createPortal(content, document.body)
}
