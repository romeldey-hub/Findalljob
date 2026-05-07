'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, Wand2, Copy, Check, ChevronRight, AlertTriangle,
} from 'lucide-react'
export interface QuickFix {
  area:    string
  reason:  string
  rewrite: string
}

interface Props {
  jobId:       string
  jobTitle?:   string
  company?:    string
  onClose:     () => void
  onApplyFull: () => void
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className="flex-shrink-0 p-1 rounded text-gray-400 dark:text-slate-500 hover:text-[#2563EB] dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-500" />
        : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function FixCard({ fix, index }: { fix: QuickFix; index: number }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#263549]/40 p-4">
      {/* Area label */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-5 h-5 rounded-full bg-[#2563EB]/10 dark:bg-[#2563EB]/20 text-[#2563EB] text-[10px] font-black flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <span className="text-[13px] font-bold text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
          {fix.area}
        </span>
      </div>

      {/* Why it matters */}
      <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-relaxed mb-3 pl-7">
        {fix.reason}
      </p>

      {/* Suggested rewrite */}
      <div className="ml-7 rounded-lg border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#1E293B] px-3 py-2.5 flex items-start gap-2">
        <p className="flex-1 text-[12px] text-gray-700 dark:text-slate-300 leading-relaxed italic">
          &ldquo;{fix.rewrite}&rdquo;
        </p>
        <CopyButton text={fix.rewrite} />
      </div>
    </div>
  )
}

function ModalContent({ jobId, jobTitle, company, onClose, onApplyFull }: Props) {
  const [fixes,     setFixes]     = useState<QuickFix[] | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [overloaded, setOverloaded] = useState(false)

  useEffect(() => {
    void fetchFixes()
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchFixes() {
    setLoading(true); setError(null); setOverloaded(false)
    try {
      const res  = await fetch('/api/resume/quick-fixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setOverloaded(res.status === 503)
        setError(data.error ?? 'Could not generate suggestions.')
        return
      }
      setFixes(data.fixes ?? [])
    } catch {
      setError('Connection failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#F1F5F9] dark:border-[#334155] flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Wand2 className="w-4 h-4 text-[#2563EB]" />
              <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">
                High-Impact Tweaks
              </p>
            </div>
            {jobTitle && (
              <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-tight">
                {jobTitle}{company ? ` · ${company}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#263549] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
              <p className="text-[13px] text-gray-400 dark:text-slate-500">
                Analysing fit gaps for this role…
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              <p className="text-[13px] text-gray-500 dark:text-slate-400 text-center max-w-[280px] leading-relaxed">
                {error}
              </p>
              {!overloaded && (
                <button
                  onClick={() => void fetchFixes()}
                  className="text-[12px] font-semibold text-[#2563EB] hover:underline"
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {!loading && !error && fixes !== null && (
            <>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 pb-1">
                {fixes.length} targeted improvement{fixes.length !== 1 ? 's' : ''} — small changes, big impact.
              </p>
              {fixes.map((fix, i) => (
                <FixCard key={i} fix={fix} index={i} />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="px-5 py-4 border-t border-[#F1F5F9] dark:border-[#334155] flex items-center gap-3 flex-shrink-0">
            {overloaded ? (
              /* Overloaded — don't push user to another failing Claude call */
              <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#F1F5F9] dark:bg-[#263549] text-gray-400 dark:text-slate-500 text-[12px]">
                <Loader2 className="w-3.5 h-3.5" />
                AI is busy — please try again in a moment
              </div>
            ) : (
              <button
                onClick={onApplyFull}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold transition-all hover:shadow-md"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Apply Full AI Optimization
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[12px] text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors whitespace-nowrap"
            >
              {overloaded ? 'Close' : 'Maybe later'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function QuickFixesModal(props: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 0); return () => clearTimeout(t) }, [])
  if (!mounted) return null
  return createPortal(<ModalContent {...props} />, document.body)
}
