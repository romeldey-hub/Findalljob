'use client'

import { useState, useEffect } from 'react'
import {
  ExternalLink, Loader2, AlertTriangle,
  Search, X, Globe, ShieldCheck,
} from 'lucide-react'
import { track } from '@/lib/analytics'
import type { ApplyStatus, VerifiedLabel } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApplyButtonJob {
  id:              string
  title:           string
  company:         string
  url:             string
  apply_url?:      string
  apply_status?:   ApplyStatus
  verified_label?: VerifiedLabel
  source?:         string
}

interface ApplyButtonProps {
  job:      ApplyButtonJob
  onApply?: () => void
}

type ButtonState = 'idle' | 'opening'

// ── Source label map ───────────────────────────────────────────────────────────

export function sourceLabel(source?: string): string | null {
  if (!source) return null
  const map: Record<string, string> = {
    greenhouse: 'Greenhouse', lever: 'Lever', workable: 'Workable',
    apify_indeed: 'Indeed', apify_linkedin: 'LinkedIn',
    apify_naukri: 'Naukri', apify_apna: 'Apna',
    apify: 'Indeed', adzuna: 'Adzuna', jsearch: 'JSearch',
  }
  return map[source] ?? null
}

// ── Fallback Modal ─────────────────────────────────────────────────────────────

function FallbackModal({
  job,
  onClose,
  onDismiss,
}: {
  job:       ApplyButtonJob
  onClose:   () => void
  onDismiss: () => void
}) {
  const googleApplyUrl  = `https://www.google.com/search?q=${encodeURIComponent(`${job.title} ${job.company} apply now`)}`
  const companyCareers  = `https://www.google.com/search?q=${encodeURIComponent(`${job.company} careers jobs`)}`

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function open(url: string, label: string) {
    track.applyFailure(job.title, 'manual')
    window.open(url, '_blank', 'noopener,noreferrer')
    onClose()
    void label
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onDismiss} />

      {/* Sheet */}
      <div className="relative w-full max-w-sm bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-2xl z-10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1F5F9] dark:border-[#334155]">
          <div>
            <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">
              Having trouble applying?
            </p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 leading-tight">
              Try one of these alternatives
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#263549] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="p-4 space-y-2">

          {/* Job listing page */}
          {job.url && job.url !== job.apply_url && (
            <button
              onClick={() => open(job.url, 'listing')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-left hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-[#475569] transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                <ExternalLink className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
                  View Job Listing
                </p>
                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">
                  {sourceLabel(job.source) ?? 'Original posting'} page
                </p>
              </div>
            </button>
          )}

          {/* Google job search */}
          <button
            onClick={() => open(googleApplyUrl, 'google')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-left hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-[#475569] transition-all"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
              <Search className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
                Search This Job
              </p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">
                {job.title} · {job.company}
              </p>
            </div>
          </button>

          {/* Company careers */}
          <button
            onClick={() => open(companyCareers, 'company-careers')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-left hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-[#475569] transition-all"
          >
            <div className="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
              <Globe className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
                {job.company} Careers Page
              </p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                Find all open roles at {job.company}
              </p>
            </div>
          </button>

        </div>
      </div>
    </div>
  )
}

// ── Verified badge ─────────────────────────────────────────────────────────────

export function VerifiedBadge({ label }: { label?: VerifiedLabel }) {
  if (label === 'verified') {
    return (
      <div className="flex items-center gap-0.5 text-[10px] font-semibold text-green-600 dark:text-green-500">
        <ShieldCheck className="w-3 h-3" />
        Verified
      </div>
    )
  }
  if (label === 'stale') {
    return (
      <div className="flex items-center gap-0.5 text-[10px] font-medium text-amber-500 dark:text-amber-400">
        <ShieldCheck className="w-3 h-3" />
        Checked
      </div>
    )
  }
  // unverified — no badge (neutral, no alarm)
  return null
}

// ── ApplyButton ────────────────────────────────────────────────────────────────

export function ApplyButton({ job, onApply }: ApplyButtonProps) {
  const [state,       setState]       = useState<ButtonState>('idle')
  const [showFallback, setShowFallback] = useState(false)

  const applyUrl  = job.apply_url || job.url
  const isBroken  = job.apply_status === 'broken'

  function handleClick() {
    if (!applyUrl) {
      setShowFallback(true)
      return
    }
    setState('opening')
    track.applyClick(job.title, job.source)
    window.open(applyUrl, '_blank', 'noopener,noreferrer')
    onApply?.()
    setState('idle')
  }

  return (
    <>
      <div className="flex flex-col items-center gap-1 w-full">

        {/* Broken-link warning — only shown when confirmed broken */}
        {isBroken && (
          <div className="flex items-center gap-1 text-[10px] text-amber-500 dark:text-amber-400">
            <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
            <span>Link may be outdated</span>
          </div>
        )}

        {/* ── Main button ── */}
        <button
          onClick={handleClick}
          disabled={state === 'opening'}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-transparent text-gray-500 dark:text-slate-400 text-[12px] font-semibold hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-[#475569] hover:text-gray-700 dark:hover:text-slate-300 transition-all hover:scale-[1.02] active:scale-100 disabled:opacity-60"
        >
          {state === 'opening'
            ? <><Loader2 className="w-3 h-3 animate-spin" />Opening…</>
            : <>Apply Now <ExternalLink className="w-3 h-3" /></>
          }
        </button>

        {/* Manual escape hatch — assistive, not intrusive */}
        <button
          onClick={() => setShowFallback(true)}
          className="text-[10px] text-gray-400 dark:text-slate-600 hover:text-[#2563EB] dark:hover:text-blue-400 transition-colors"
        >
          Having trouble?
        </button>

      </div>

      {/* Fallback modal */}
      {showFallback && (
        <FallbackModal
          job={job}
          onClose={() => setShowFallback(false)}
          onDismiss={() => setShowFallback(false)}
        />
      )}
    </>
  )
}
