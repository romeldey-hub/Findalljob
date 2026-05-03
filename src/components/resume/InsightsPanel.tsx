'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Wand2, Download, Mic, Lightbulb,
  ChevronRight, Loader2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ParsedResume } from '@/types'
import { toDataUri } from '@/lib/utils'
import { useCountUp, useAnimate } from '@/lib/useAnimations'
import { ResumePrintView } from '@/components/resume/ResumePrintView'
import { InterviewModal } from '@/components/InterviewModal'
import { OptimizeFlow } from '@/components/resume/OptimizeFlow'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

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
  icon, label, subtext, onClick, disabled = false, primary = false,
}: {
  icon: React.ReactNode
  label: string
  subtext: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  if (primary) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-left transition-all hover:scale-[1.01] active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[13px] leading-tight">{label}</p>
          <p className="text-[11px] text-blue-200 mt-0.5">{subtext}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-blue-300 flex-shrink-0" />
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-left hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-[#475569] hover:scale-[1.01] active:scale-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="w-7 h-7 rounded-lg bg-[#F1F5F9] dark:bg-[#263549] flex items-center justify-center flex-shrink-0">
        <span className="text-gray-400 dark:text-slate-500">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F1F5F9] leading-tight">{label}</p>
        <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{subtext}</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
    </button>
  )
}

// ── InsightsPanel ─────────────────────────────────────────────────────────────

export function InsightsPanel({ parsedData, avatarUrl }: { parsedData: ParsedResume; avatarUrl?: string | null }) {
  const router       = useRouter()
  const printRef     = useRef<HTMLDivElement>(null)
  const [pdfBusy, setPdfBusy]             = useState(false)
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null)
  const [showInterview, setShowInterview] = useState(false)
  const [showOptimize, setShowOptimize]   = useState(false)

  const { data: profileData } = useSWR('/api/profile', fetcher)
  const isPro = profileData?.plan === 'pro'

  // Extract most-recent job from resume for interview context
  const recentExp = parsedData.experience?.[0]
  const interviewJob = {
    id:          'resume',
    title:       recentExp?.title    ?? 'General Practice',
    company:     recentExp?.company  ?? '',
    description: '',
  }

  useEffect(() => {
    if (!avatarUrl) { setAvatarDataUri(null); return }
    toDataUri(avatarUrl).then(setAvatarDataUri).catch(() => setAvatarDataUri(null))
  }, [avatarUrl])

  const { overall, skillsMatch, expScore, contentQuality } = computeScores(parsedData)

  const tip = (parsedData.experience?.some(e => (e.bullets?.length ?? 0) >= 3))
    ? 'Add quantifiable achievements to your bullet points (e.g., "Increased revenue by 30%") to stand out to recruiters.'
    : 'Expand each role with 3–5 bullet points highlighting key responsibilities and measurable outcomes.'

  async function handleDownloadPDF() {
    if (!printRef.current) return
    setPdfBusy(true)
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
      ])
      const dataUrl = await toPng(printRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
        cacheBust: true,
      })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297)
      pdf.save(`${parsedData.name ?? 'resume'}.pdf`)
    } catch (err) {
      console.error('PDF generation failed', err)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <aside className="space-y-4 sticky top-6">

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
        <h3 className="font-bold text-[13px] text-[#0F172A] dark:text-[#F1F5F9] mb-3 tracking-tight">
          Next Steps to Get Hired Faster
        </h3>
        <div className="space-y-2">
          <ActionCard
            icon={<Wand2 className="w-4 h-4 text-white" />}
            label="Optimize Resume"
            subtext="Boost your chances"
            onClick={() => setShowOptimize(true)}
            primary
          />
          <ActionCard
            icon={<Mic className="w-4 h-4 text-white" />}
            label="Start Mock Interview"
            subtext="Practice before you apply"
            onClick={() => setShowInterview(true)}
            primary
          />
          <ActionCard
            icon={pdfBusy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />}
            label={pdfBusy ? 'Generating PDF…' : 'Download Resume'}
            subtext="Ready to submit"
            onClick={handleDownloadPDF}
            disabled={pdfBusy}
          />
        </div>
      </div>

      {/* ── Tip ─────────────────────────────────────────────────── */}
      <div className="bg-[#EFF6FF] dark:bg-[#1E3A5F] rounded-2xl border border-blue-100 dark:border-blue-900 p-5">
        <div className="flex items-center gap-2 mb-2.5">
          <Lightbulb className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
          <span className="font-bold text-[11px] text-[#2563EB] uppercase tracking-[0.1em]">Tip</span>
        </div>
        <p className="text-[13px] text-gray-700 dark:text-slate-300 leading-relaxed">{tip}</p>
        <button
          onClick={() => router.push('/optimizer')}
          className="mt-3 flex items-center gap-1 text-[12px] font-semibold text-[#2563EB] hover:underline"
        >
          View Suggestions <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hidden A4 element captured by html-to-image for PDF download */}
      <div style={{ position: 'absolute', left: -9999, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={printRef}>
          <ResumePrintView data={parsedData} avatarUrl={avatarDataUri} />
        </div>
      </div>

      {showInterview && (
        <InterviewModal
          job={interviewJob}
          isPro={isPro}
          onClose={() => setShowInterview(false)}
          mode="resume"
        />
      )}

      {showOptimize && (
        <OptimizeFlow
          mode="general"
          avatarUrl={avatarDataUri}
          onClose={() => setShowOptimize(false)}
        />
      )}

    </aside>
  )
}
