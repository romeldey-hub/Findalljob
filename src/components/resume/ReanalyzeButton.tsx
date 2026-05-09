'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Zap, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { CountryConfirmStep, type CountryChoice } from '@/components/resume/CountryConfirmStep'

interface ReanalyzeButtonProps {
  isPro?: boolean
  reanalyzeCount?: number
  reanalyzeLimit?: number
}

export function ReanalyzeButton({ isPro = true, reanalyzeCount = 0, reanalyzeLimit = 3 }: ReanalyzeButtonProps) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [countryConfirmPending, setCountryConfirmPending] = useState<{
    detectedCountry: string | null
    detectedCountryCode: string | null
  } | null>(null)

  const limitReached = !isPro && reanalyzeCount >= reanalyzeLimit

  // Phase 1: parse resume only, then pause for country confirmation
  async function handleClick() {
    if (limitReached) return
    setRunning(true)
    toast.info('Parsing your resume…')

    const abortController = new AbortController()
    const abortTimer = setTimeout(() => abortController.abort(), 5 * 60 * 1000)

    try {
      const res = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'parse_resume' }),
        signal: abortController.signal,
      })

      if (!res.ok) {
        let msg = 'Parsing failed. Please try again.'
        try { const d = await res.json(); if (d.error) msg = d.error } catch { /* non-JSON */ }
        toast.error(msg)
        return
      }

      const data = await res.json().catch(() => ({})) as Record<string, unknown>
      if (data.status !== 'country_confirmation_required') {
        toast.error('Unexpected server response. Please try again.')
        return
      }

      setCountryConfirmPending({
        detectedCountry:     (data.detectedCountry     as string | null) ?? null,
        detectedCountryCode: (data.detectedCountryCode as string | null) ?? null,
      })
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      toast.error(isTimeout ? 'Parsing timed out. Please try again.' : 'Parsing failed. Please try again.')
    } finally {
      clearTimeout(abortTimer)
      setRunning(false)
    }
  }

  // Phase 2: job search after user confirms country
  async function handleCountryConfirmed(choice: CountryChoice) {
    setCountryConfirmPending(null)
    setRunning(true)
    toast.info('Finding job matches — this takes 3–5 minutes…')

    const abortController = new AbortController()
    const abortTimer = setTimeout(() => abortController.abort(), 10 * 60 * 1000)

    try {
      const res = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedSearchCountry: choice.selectedSearchCountry,
          searchMode:            choice.searchMode,
          wasDetected:           choice.wasDetected,
        }),
        signal: abortController.signal,
      })

      if (!res.ok) {
        let msg = 'Analysis failed. Please try again.'
        try { const d = await res.json(); if (d.error) msg = d.error } catch { /* non-JSON */ }
        toast.error(msg)
        return
      }

      if (res.body) {
        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

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
                  if (event.done) {
                    toast.success(`Analysis complete! Found ${event.matchCount ?? 0} matches.`)
                    router.refresh()
                  }
                  if (event.error) {
                    toast.error(String(event.error))
                  }
                } catch { /* malformed SSE */ }
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      toast.error(isTimeout
        ? 'Analysis timed out. Please try again.'
        : 'Analysis failed. Please try again.'
      )
    } finally {
      clearTimeout(abortTimer)
      setRunning(false)
    }
  }

  if (limitReached) {
    return (
      <div className="mt-3 space-y-1.5">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#263549] border border-[#E5E7EB] dark:border-[#334155] text-gray-400 dark:text-slate-500 text-[13px] font-semibold cursor-not-allowed">
          <Lock className="w-3.5 h-3.5" />
          Re-analyze Now
        </div>
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          You&apos;ve used all {reanalyzeLimit} free re-analyses.{' '}
          <a href="/settings" className="underline font-semibold hover:text-amber-700 dark:hover:text-amber-300">
            Upgrade to continue
          </a>
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-1">
      <button
        onClick={handleClick}
        disabled={running}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {running
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing…</>
          : <><Zap className="w-3.5 h-3.5" />Re-analyze Now</>}
      </button>
      {!isPro && (
        <p className="text-[11px] text-gray-400 dark:text-slate-500">
          {reanalyzeLimit - reanalyzeCount} of {reanalyzeLimit} free re-analyses remaining
        </p>
      )}

      {/* Country confirmation modal — centered overlay after parsing completes */}
      {countryConfirmPending && (
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
    </div>
  )
}
