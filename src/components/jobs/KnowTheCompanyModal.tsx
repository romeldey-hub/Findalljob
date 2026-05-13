'use client'

import { useState, useEffect } from 'react'
import {
  X, Building2, Globe, MapPin, Users,
  Lightbulb, AlertCircle, Loader2, ExternalLink,
} from 'lucide-react'

interface CompanySnapshot {
  company_name:   string
  overview:       string
  industry:       string | null
  website:        string | null
  headquarters:   string | null
  company_size:   string | null
  why_relevant:   string
  interview_prep: string[]
  data_limited:   boolean
}

export interface KnowTheCompanyJob {
  id:           string
  company:      string
  title:        string
  description?: string
  location?:    string
  url?:         string
  source?:      string
}

interface Props {
  job:     KnowTheCompanyJob
  onClose: () => void
}

export function KnowTheCompanyModal({ job, onClose }: Props) {
  const [snapshot,     setSnapshot]     = useState<CompanySnapshot | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [needsUpgrade, setNeedsUpgrade] = useState(false)

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fetch snapshot from API
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/jobs/company-snapshot', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            job_id:      job.id,
            company:     job.company,
            title:       job.title,
            description: job.description,
            location:    job.location,
            url:         job.url,
            source:      job.source,
          }),
        })
        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          if (data.requiresUpgrade) {
            setNeedsUpgrade(true)
          } else {
            setError(data.error ?? 'Something went wrong. Please try again.')
          }
        } else {
          setSnapshot(data.snapshot as CompanySnapshot)
        }
      } catch {
        if (!cancelled) setError('Failed to load company info. Please check your connection.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [job.id, job.company, job.title, job.description, job.location, job.url, job.source])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-2xl z-10 overflow-hidden max-h-[88vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F1F5F9] dark:border-[#334155] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#2563EB]" />
            <span className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Know the Company</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#263549] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="space-y-2">
                <div className="h-5 bg-gray-100 dark:bg-[#263549] rounded-lg w-3/5" />
                <div className="h-3.5 bg-gray-100 dark:bg-[#263549] rounded-md w-1/4" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3 bg-gray-100 dark:bg-[#263549] rounded w-full" />
                <div className="h-3 bg-gray-100 dark:bg-[#263549] rounded w-full" />
                <div className="h-3 bg-gray-100 dark:bg-[#263549] rounded w-4/5" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3 bg-gray-100 dark:bg-[#263549] rounded w-2/5" />
                <div className="h-3 bg-gray-100 dark:bg-[#263549] rounded w-1/3" />
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-[#263549] h-16" />
              <div className="space-y-2">
                <div className="h-3 bg-gray-100 dark:bg-[#263549] rounded w-2/5" />
                <div className="h-3 bg-gray-100 dark:bg-[#263549] rounded w-full" />
                <div className="h-3 bg-gray-100 dark:bg-[#263549] rounded w-4/5" />
                <div className="h-3 bg-gray-100 dark:bg-[#263549] rounded w-3/4" />
              </div>
            </div>
          )}

          {/* Insufficient credits */}
          {!loading && needsUpgrade && (
            <div className="text-center py-8">
              <Lightbulb className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9] mb-1.5">
                Not enough credits
              </p>
              <p className="text-[12px] text-gray-500 dark:text-slate-400 leading-relaxed">
                Generating a company snapshot costs 0.5 credits.
                Upgrade your plan to get more monthly credits.
              </p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-red-600 dark:text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          {/* Snapshot content */}
          {!loading && snapshot && (
            <>
              {/* Company name + industry tag */}
              <div>
                <h3 className="text-[18px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
                  {snapshot.company_name}
                </h3>
                {snapshot.industry && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-[11px] font-semibold">
                    {snapshot.industry}
                  </span>
                )}
              </div>

              {/* Overview */}
              <p className="text-[13px] text-gray-600 dark:text-slate-300 leading-relaxed">
                {snapshot.overview}
              </p>

              {/* Metadata — HQ, size, website */}
              {(snapshot.headquarters || snapshot.company_size || snapshot.website) && (
                <div className="space-y-1.5">
                  {snapshot.headquarters && (
                    <div className="flex items-center gap-2 text-[12px] text-gray-500 dark:text-slate-400">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-slate-500" />
                      {snapshot.headquarters}
                    </div>
                  )}
                  {snapshot.company_size && (
                    <div className="flex items-center gap-2 text-[12px] text-gray-500 dark:text-slate-400">
                      <Users className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-slate-500" />
                      {snapshot.company_size}
                    </div>
                  )}
                  {snapshot.website && (
                    <a
                      href={snapshot.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[12px] text-[#2563EB] hover:underline"
                    >
                      <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                      {snapshot.website.replace(/^https?:\/\//, '')}
                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-60" />
                    </a>
                  )}
                </div>
              )}

              {/* Why relevant */}
              <div className="rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-blue-500 dark:text-blue-400 mb-1.5">
                  Why this may be relevant to you
                </p>
                <p className="text-[12px] text-gray-600 dark:text-slate-300 leading-relaxed">
                  {snapshot.why_relevant}
                </p>
              </div>

              {/* Interview prep */}
              {snapshot.interview_prep.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 mb-2">
                    Interview prep angle
                  </p>
                  <ul className="space-y-2">
                    {snapshot.interview_prep.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12px] text-gray-600 dark:text-slate-300 leading-relaxed">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#F1F5F9] dark:bg-[#263549] text-[10px] font-bold flex items-center justify-center text-gray-500 dark:text-slate-400 mt-0.5">
                          {i + 1}
                        </span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Data-limited notice */}
              {snapshot.data_limited && (
                <div className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    Limited public information is available for this company. Details above are inferred from the job description.
                  </span>
                </div>
              )}
            </>
          )}

        </div>

        {/* ── Footer disclaimer — only once snapshot is loaded ── */}
        {!loading && snapshot && (
          <div className="flex-shrink-0 px-5 py-3 border-t border-[#F1F5F9] dark:border-[#334155]">
            <p className="text-[10px] text-gray-400 dark:text-slate-600 leading-relaxed">
              Generated using AI from available job and public company context. Please verify details before applying.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
