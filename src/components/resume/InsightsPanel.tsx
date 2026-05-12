'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Wand2, Download, CheckCircle2,
  ChevronRight, Loader2, Globe,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import type { ParsedResume } from '@/types'
import { toDataUri } from '@/lib/utils'
import { useCountUp, useAnimate } from '@/lib/useAnimations'
import { ResumePrintView } from '@/components/resume/ResumePrintView'
import { OptimizeFlow } from '@/components/resume/OptimizeFlow'

// ── Score helpers ─────────────────────────────────────────────────────────────

function computeScores(d: ParsedResume) {
  const overall = Math.min(100,
    (d.name      ? 10 : 0) +
    (d.email     ? 10 : 0) +
    (d.phone     ?  5 : 0) +
    (d.location  ?  5 : 0) +
    (d.summary   ? 20 : 0) +
    ((d.skills?.length ?? 0)        >= 3 ? 15 : (d.skills?.length ?? 0) > 0 ? 7 : 0) +
    ((d.experience?.length ?? 0)    >  0 ? 20 : 0) +
    ((d.education?.length ?? 0)     >  0 ? 10 : 0) +
    ((d.certifications?.length ?? 0) > 0 ?  5 : 0)
  )
  const skillsMatch    = Math.min(95, 30 + (d.skills?.length ?? 0) * 5)
  const expLen         = d.experience?.length ?? 0
  const expScore       = expLen === 0 ? 20 : expLen === 1 ? 60 : expLen === 2 ? 78 : 92
  const hasBullets     = d.experience?.some(e => (e.bullets?.length ?? 0) > 2)
  const contentQuality = Math.min(95,
    (d.summary  ? 30 : 0) +
    (hasBullets ? 40 : 20) +
    ((d.skills?.length ?? 0) > 5 ? 25 : 10)
  )
  return { overall, skillsMatch, expScore, contentQuality }
}

// ── ScoreRing ─────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r      = 44
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color  = score >= 80 ? '#16A34A' : score >= 60 ? '#2563EB' : '#D97706'
  const label  = score >= 80 ? 'Strong'  : score >= 60 ? 'Good'    : 'Fair'
  const sub    = score >= 80 ? 'Well-optimized resume'
               : score >= 60 ? 'Good, but can improve'
               : 'Needs improvement'

  const animated    = useAnimate()
  const displayScore = useCountUp(score, 1000)

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-[100px] h-[100px] flex-shrink-0 flex items-center justify-center">
        <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90 absolute inset-0">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#F1F5F9" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r}
            fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            style={{
              strokeDasharray: circ,
              strokeDashoffset: animated ? circ - filled : circ,
              transition: animated ? 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' : 'none',
            }}
          />
        </svg>
        <div className="relative z-10 text-center">
          <div className="text-[26px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-none">{displayScore}</div>
          <div className="text-[8px] font-bold tracking-[0.1em] uppercase text-gray-400 dark:text-slate-500 mt-0.5">/ 100</div>
        </div>
      </div>
      <div>
        <div className="text-[18px] font-bold text-[#0F172A] dark:text-[#F1F5F9]">{label}</div>
        <div className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5 leading-snug max-w-[120px]">{sub}</div>
      </div>
    </div>
  )
}

// ── ScoreBar ──────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, index = 0 }: { label: string; value: number; index?: number }) {
  const [width, setWidth] = useState(0)
  const barColor = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-blue-500' : 'bg-amber-500'

  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 200 + index * 120)
    return () => clearTimeout(t)
  }, [value, index])

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[12px] text-gray-500 dark:text-slate-400">{label}</span>
        <span className="text-[12px] font-bold text-[#0F172A] dark:text-[#F1F5F9]">{value}%</span>
      </div>
      <div className="h-1.5 bg-[#F1F5F9] dark:bg-[#334155] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{
            width: `${width}%`,
            transition: 'width 700ms cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
    </div>
  )
}

// ── ActionCard ────────────────────────────────────────────────────────────────

function ActionCard({
  icon, label, subtext, onClick, disabled = false, iconBg = 'bg-slate-100 dark:bg-[#263549]', iconColor = 'text-slate-400 dark:text-slate-500',
}: {
  icon: React.ReactNode
  label: string
  subtext: string
  onClick: () => void
  disabled?: boolean
  iconBg?: string
  iconColor?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full group flex items-center gap-3 px-3.5 py-3 rounded-xl border border-[#E5E7EB] dark:border-[#2D3D55] bg-transparent hover:bg-[#F8FAFC] dark:hover:bg-[#1C2E45] hover:border-[#CBD5E1] dark:hover:border-[#3D5170] transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[13px] text-[#0F172A] dark:text-[#CBD5E1] leading-tight">{label}</p>
        <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{subtext}</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}

// ── InsightsPanel ─────────────────────────────────────────────────────────────

const swr_fetcher = (url: string) => fetch(url).then(r => r.json())

export function InsightsPanel({ parsedData, avatarUrl, userId }: { parsedData: ParsedResume; avatarUrl?: string | null; userId?: string }) {
  const router       = useRouter()
  const printRef     = useRef<HTMLDivElement>(null)
  const [pdfBusy, setPdfBusy]             = useState(false)
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null)
  const [showOptimize, setShowOptimize]   = useState(false)

  const { data: appsData } = useSWR('/api/applications', swr_fetcher)
  const appliedJobs = useMemo(() => {
    return (appsData?.applications ?? []).filter(
      (a: { status: string; job?: unknown }) => a.status === 'applied' && a.job
    )
  }, [appsData])

  useEffect(() => {
    if (!avatarUrl) {
      const t = setTimeout(() => setAvatarDataUri(null), 0)
      return () => clearTimeout(t)
    }
    toDataUri(avatarUrl).then(setAvatarDataUri).catch(() => setAvatarDataUri(null))
  }, [avatarUrl])

  const { overall, skillsMatch, expScore, contentQuality } = computeScores(parsedData)

  async function handleDownloadPDF() {
    if (!printRef.current) return
    setPdfBusy(true)
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
      ])

      // Clone to document.body so html-to-image measures the element's full
      // natural height without any sticky-aside or layout constraints
      const clone = printRef.current.cloneNode(true) as HTMLElement
      clone.style.position = 'fixed'
      clone.style.left = '-9999px'
      clone.style.top = '0'
      clone.style.zIndex = '-1'
      document.body.appendChild(clone)

      let dataUrl: string
      try {
        dataUrl = await toPng(clone, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          skipFonts: true,
          cacheBust: true,
        })
      } finally {
        document.body.removeChild(clone)
      }

      const naturalSize = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image()
        img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => reject(new Error('Failed to load captured image'))
        img.src = dataUrl
      })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const imgH = (naturalSize.h * pdfW) / naturalSize.w
      let yPos = 0
      while (yPos < imgH) {
        pdf.addImage(dataUrl, 'PNG', 0, -yPos, pdfW, imgH)
        yPos += pdfH
        if (yPos < imgH) pdf.addPage()
      }
      pdf.save(`${parsedData.name ?? 'resume'}.pdf`)
    } catch (err) {
      console.error('PDF generation failed', err)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <aside className="space-y-4 [@media(min-width:1280px)_and_(min-height:750px)]:sticky [@media(min-width:1280px)_and_(min-height:750px)]:top-6">

      {/* ── Resume Score ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5">
        <h3 className="font-bold text-[13px] text-[#0F172A] dark:text-[#F1F5F9] mb-4 tracking-tight">Resume Score</h3>
        <ScoreRing score={overall} />
        <div className="mt-5 pt-4 border-t border-[#F1F5F9] dark:border-[#334155] space-y-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-1">Score Breakdown</p>
          <ScoreBar label="Skills Match"      value={skillsMatch}    index={0} />
          <ScoreBar label="Experience"        value={expScore}       index={1} />
          <ScoreBar label="Content Quality"   value={contentQuality} index={2} />
          <ScoreBar label="ATS Compatibility" value={overall}        index={3} />
        </div>
      </div>

      {/* ── Next Steps ───────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5">
        <h3 className="font-semibold text-[12px] uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 mb-3">
          Next Steps
        </h3>
        <div className="space-y-2">
          <ActionCard
            icon={<Globe className="w-[15px] h-[15px]" />}
            label="Create Public Profile"
            subtext="Get discovered by recruiters online"
            onClick={() => router.push('/settings#public-profile')}
            iconBg="bg-blue-50 dark:bg-blue-950/50"
            iconColor="text-blue-500 dark:text-blue-400"
          />
          <ActionCard
            icon={<Wand2 className="w-[15px] h-[15px]" />}
            label="Improve Resume with AI"
            subtext="Upgrade your resume with AI suggestions"
            onClick={() => setShowOptimize(true)}
            iconBg="bg-violet-50 dark:bg-violet-950/50"
            iconColor="text-violet-500 dark:text-violet-400"
          />
          <ActionCard
            icon={pdfBusy
              ? <Loader2 className="w-[15px] h-[15px] animate-spin" />
              : <Download className="w-[15px] h-[15px]" />}
            label={pdfBusy ? 'Generating PDF…' : 'Download Resume'}
            subtext="Ready to submit"
            onClick={handleDownloadPDF}
            disabled={pdfBusy}
          />
        </div>
      </div>

      {/* ── Applied Jobs ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[12px] uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500">
            Applied Jobs
          </h3>
          {appliedJobs.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800">
              {appliedJobs.length}
            </span>
          )}
        </div>
        <ActionCard
          icon={<CheckCircle2 className="w-[15px] h-[15px]" />}
          label="View All Applied Jobs"
          subtext="See jobs you have marked as applied"
          onClick={() => router.push('/tracker')}
          iconBg="bg-green-50 dark:bg-green-950/50"
          iconColor="text-green-500 dark:text-green-400"
        />
      </div>

      {/* Hidden A4 element captured by html-to-image for PDF download */}
      <div style={{ position: 'absolute', left: -9999, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={printRef}>
          <ResumePrintView data={parsedData} avatarUrl={avatarDataUri} />
        </div>
      </div>

      {/* AI resume improvement — reuses the full existing general optimize flow */}
      {showOptimize && (
        <OptimizeFlow
          mode="general"
          userId={userId}
          avatarUrl={avatarUrl}
          currentScore={overall}
          onClose={() => setShowOptimize(false)}
          redirectTo="/resume"
          onSaved={() => router.refresh()}
        />
      )}

    </aside>
  )
}
