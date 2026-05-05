'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Zap } from 'lucide-react'
import { toast } from 'sonner'

export function ReanalyzeButton() {
  const router = useRouter()
  const [running, setRunning] = useState(false)

  async function handleClick() {
    setRunning(true)
    toast.info('Analyzing your resume — this takes 3–5 minutes…')

    const abortController = new AbortController()
    const abortTimer = setTimeout(() => abortController.abort(), 10 * 60 * 1000)

    try {
      const res = await fetch('/api/resume/analyze', {
        method: 'POST',
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

  return (
    <button
      onClick={handleClick}
      disabled={running}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-3"
    >
      {running
        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing…</>
        : <><Zap className="w-3.5 h-3.5" />Re-analyze Now</>}
    </button>
  )
}
