'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  Building2,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Users,
  X,
} from 'lucide-react'

type CompanyInsight = {
  company_name: string
  website: string | null
  overview: string
  industry: string | null
  headquarters: string | null
  company_size: string | null
  founded_year: string | null
  ownership_or_parent?: string | null
  products_services: string[]
  key_markets?: string[]
  india_presence?: string | null
  careers_hiring_context?: string | null
  recent_relevant_news?: string[]
  hiring_relevance: string
  why_relevant: string[]
  interview_prep: string[]
  sources: Array<{ title: string; url: string; type: string }>
  official_website_confidence?: 'high' | 'medium' | 'low'
  crawl_content_confidence?: 'high' | 'medium' | 'low'
  limited_access_note?: string | null
  confidence: 'high' | 'medium' | 'low'
  low_confidence_note: string | null
}

type Props = {
  job: {
    id: string
    company: string
    title: string
    location: string
    description: string
    source: string
    apply_url?: string | null
  }
  onClose: () => void
}

function SnapshotRow({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  if (!isUsefulText(value)) return null
  return (
    <div className="flex items-start gap-2 text-[12px] text-gray-500 dark:text-slate-400">
      <span className="mt-0.5 flex-shrink-0 text-gray-400 dark:text-slate-500">{icon}</span>
      <span><span className="font-semibold text-gray-600 dark:text-slate-300">{label}:</span> {value}</span>
    </div>
  )
}

function isUsefulText(value?: string | null) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return Boolean(normalized) &&
    normalized !== 'not confidently available' &&
    normalized !== 'not available' &&
    normalized !== 'n/a' &&
    normalized !== 'unknown' &&
    normalized !== 'none'
}

function usefulList(value?: string[]) {
  return (value ?? []).filter(isUsefulText)
}

export function OpenAIV2CompanyModal({ job, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [insight, setInsight] = useState<CompanyInsight | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/openai-search/company-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resultId: job.id,
            company: job.company,
            title: job.title,
            location: job.location,
            description: job.description,
            apply_url: job.apply_url,
            source: job.source,
          }),
        })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error ?? 'Could not fetch company details.')
        } else {
          setInsight(data.insight as CompanyInsight)
        }
      } catch {
        if (!cancelled) setError('Failed to load company info. Please check your connection.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [job])

  if (!mounted) return null

  const productsServices = usefulList(insight?.products_services)
  const keyMarkets = usefulList(insight?.key_markets)
  const whyRelevant = usefulList(insight?.why_relevant)
  const interviewPrep = usefulList(insight?.interview_prep)
  const recentNews = usefulList(insight?.recent_relevant_news)
  const website = insight && isUsefulText(insight.website) ? insight.website : null
  const hasSnapshot = Boolean(
    insight && (
      website ||
      isUsefulText(insight.industry) ||
      isUsefulText(insight.headquarters) ||
      isUsefulText(insight.company_size) ||
      isUsefulText(insight.founded_year) ||
      isUsefulText(insight.ownership_or_parent)
    ),
  )

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center p-3 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl dark:border-[#334155] dark:bg-[#1E293B]">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[#F1F5F9] px-5 py-4 dark:border-[#334155]">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#2563EB]" />
            <span className="text-[14px] font-bold text-[#0F172A] dark:text-[#F1F5F9]">Know the Company</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-[#263549] dark:hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
              <Loader2 className="mb-3 h-6 w-6 animate-spin text-[#2563EB]" />
              <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Finding reliable company details…</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Official sources are checked first.</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-950/20">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="text-[12px] leading-relaxed text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {!loading && insight && (
            <>
              <section>
                <h3 className="text-[18px] font-black leading-tight text-[#0F172A] dark:text-[#F1F5F9]">
                  {insight.company_name || job.company}
                </h3>
                {insight.confidence === 'low' && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>{insight.low_confidence_note || 'Low confidence: this company may be ambiguous. Please verify details before applying.'}</span>
                  </div>
                )}
                {insight.confidence !== 'low' && isUsefulText(insight.limited_access_note) && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                    {insight.limited_access_note}
                  </div>
                )}
              </section>

              {hasSnapshot && (
                <section className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500">Company Snapshot</p>
                  {website && (
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[12px] text-[#2563EB] hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                      {website.replace(/^https?:\/\//, '')}
                      <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 opacity-60" />
                    </a>
                  )}
                  <SnapshotRow icon={<Building2 className="h-3.5 w-3.5" />} label="Industry" value={insight.industry} />
                  <SnapshotRow icon={<MapPin className="h-3.5 w-3.5" />} label="Headquarters" value={insight.headquarters} />
                  <SnapshotRow icon={<Users className="h-3.5 w-3.5" />} label="Company size" value={insight.company_size} />
                  <SnapshotRow icon={<Building2 className="h-3.5 w-3.5" />} label="Founded" value={insight.founded_year} />
                  <SnapshotRow icon={<Building2 className="h-3.5 w-3.5" />} label="Ownership" value={insight.ownership_or_parent} />
                </section>
              )}

              {isUsefulText(insight.overview) && (
                <section>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500">What the Company Does</p>
                  <p className="text-[13px] leading-relaxed text-gray-600 dark:text-slate-300">{insight.overview}</p>
                </section>
              )}

              {(productsServices.length > 0 || keyMarkets.length > 0) && (
                <section>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500">Products / Services</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...productsServices, ...keyMarkets].map((item) => (
                      <span key={item} className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:bg-[#263549] dark:text-slate-300">
                        {item}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {isUsefulText(insight.india_presence) && (
                <section>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500">India Presence</p>
                  <p className="text-[13px] leading-relaxed text-gray-600 dark:text-slate-300">{insight.india_presence}</p>
                </section>
              )}

              {(isUsefulText(insight.hiring_relevance) || isUsefulText(insight.careers_hiring_context)) && (
                <section className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 dark:border-blue-900/30 dark:bg-blue-950/20">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-500 dark:text-blue-400">Hiring relevance for this role</p>
                  {isUsefulText(insight.hiring_relevance) && (
                    <p className="text-[12px] leading-relaxed text-gray-600 dark:text-slate-300">{insight.hiring_relevance}</p>
                  )}
                  {isUsefulText(insight.careers_hiring_context) && (
                    <p className="mt-2 text-[12px] leading-relaxed text-gray-600 dark:text-slate-300">{insight.careers_hiring_context}</p>
                  )}
                </section>
              )}

              {whyRelevant.length > 0 && (
                <section>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500">Why This Role May Fit You</p>
                  <ul className="space-y-2">
                    {whyRelevant.map((item, index) => (
                      <li key={index} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-gray-600 dark:text-slate-300">
                        <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-[10px] font-bold text-gray-500 dark:bg-[#263549] dark:text-slate-400">{index + 1}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {interviewPrep.length > 0 && (
                <section>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500">Interview Prep Notes</p>
                  <ul className="space-y-2">
                    {interviewPrep.map((item, index) => (
                      <li key={index} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-gray-600 dark:text-slate-300">
                        <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-[10px] font-bold text-gray-500 dark:bg-[#263549] dark:text-slate-400">{index + 1}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {recentNews.length > 0 && (
                <section>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500">Recent Relevant News</p>
                  <ul className="space-y-2">
                    {recentNews.map((item, index) => (
                      <li key={index} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-gray-600 dark:text-slate-300">
                        <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-[10px] font-bold text-gray-500 dark:bg-[#263549] dark:text-slate-400">{index + 1}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500">Sources</p>
                {insight.sources.length > 0 ? (
                  <ul className="space-y-1.5">
                    {insight.sources.map((source) => (
                      <li key={`${source.url}-${source.title}`}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#2563EB] hover:underline"
                        >
                          {source.title}
                          <span className="text-gray-400">({source.type})</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-gray-500 dark:text-slate-400">No reliable source links were available.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
