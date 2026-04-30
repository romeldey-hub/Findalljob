'use client'

import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Wand2, Download, Loader2, Building2, ExternalLink, Sparkles,
  MapPin, Clock, Briefcase, CheckCircle2, Eye, X, RefreshCw,
  FileText, Calendar, Plus, Check, GraduationCap, Trash2, Crown,
  Bookmark, BookmarkCheck,
} from 'lucide-react'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { resolveAvatar } from '@/lib/avatar'
import { toDataUri } from '@/lib/utils'
import { PaywallModal } from '@/components/PaywallModal'
import { useCountUp, useAnimate } from '@/lib/useAnimations'

const fetcher = (url: string) => fetch(url).then(r => r.json())

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProcessedResume {
  id: string
  jobId: string
  jobTitle: string
  company: string
  location: string
  description: string
  applyUrl: string
  salary?: string | null
  createdAt: string
  optimizedData: OptimizedResumeData
}

interface RawSavedResume {
  id: string
  job_id: string
  optimized_text: string
  created_at: string
  jobs: { title: string; company: string; location: string; description: string; url: string; salary?: string } | null
}

interface PendingOptimization {
  jobId: string
  jobTitle: string
  company: string
  location: string
  description: string
  applyUrl: string
  salary?: string | null
  optimizedData: OptimizedResumeData
}

function parseRaw(r: RawSavedResume): ProcessedResume {
  return {
    id: r.id,
    jobId: r.job_id,
    jobTitle: r.jobs?.title ?? 'Unknown Job',
    company: r.jobs?.company ?? '',
    location: r.jobs?.location ?? '',
    description: r.jobs?.description ?? '',
    applyUrl: r.jobs?.url ?? '',
    salary: r.jobs?.salary,
    createdAt: r.created_at,
    optimizedData: JSON.parse(r.optimized_text) as OptimizedResumeData,
  }
}

// ── Progress modal ────────────────────────────────────────────────────────────

const STEPS = ['Analyzing Job', 'Optimizing Resume', 'Generating Output']

function ProgressModal({
  step,
  error,
  onRetry,
  onClose,
}: {
  step: number
  error: string | null
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-2xl p-6">

        {error ? (
          /* ── Error state ── */
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <X className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Optimization Failed</p>
                <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">Something went wrong</p>
              </div>
            </div>
            <p className="text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 leading-relaxed">
              {error}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
              >
                Close
              </button>
              <button
                onClick={onRetry}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />Retry
              </button>
            </div>
          </div>
        ) : (
          /* ── Progress state ── */
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] dark:bg-[#1E3A5F] flex items-center justify-center flex-shrink-0 relative">
                <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />
                <Sparkles className="w-3 h-3 text-amber-400 absolute -top-1 -right-1" />
              </div>
              <div>
                <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">{STEPS[step - 1]}…</p>
                <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">AI is tailoring your resume to this role</p>
              </div>
            </div>
            <div className="flex items-center">
              {STEPS.map((label, i) => {
                const n = i + 1
                const done = step > n
                const active = step === n
                return (
                  <div key={n} className="flex items-center flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                      <div className={[
                        'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                        done   ? 'bg-green-500 text-white'
                        : active ? 'bg-[#2563EB] text-white ring-4 ring-blue-100 dark:ring-blue-900/40'
                        : 'bg-[#F1F5F9] dark:bg-[#334155] text-gray-400 dark:text-slate-500',
                      ].join(' ')}>
                        {done ? <Check className="w-3.5 h-3.5" /> : n}
                      </div>
                      <span className={[
                        'text-[11px] font-medium whitespace-nowrap',
                        done   ? 'text-green-600 dark:text-green-400'
                        : active ? 'text-[#0F172A] dark:text-[#F1F5F9]'
                        : 'text-gray-400 dark:text-slate-500',
                      ].join(' ')}>{label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-3 mb-4 transition-colors ${done ? 'bg-green-300 dark:bg-green-700' : 'bg-[#E5E7EB] dark:bg-[#334155]'}`} />
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[12px] text-center text-gray-400 dark:text-slate-500 mt-5">
              This takes about 20–30 seconds…
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── ATS Score Ring ────────────────────────────────────────────────────────────

function ATSScoreRing({ score }: { score: number }) {
  const r      = 36
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color  = score >= 80 ? '#16A34A' : score >= 60 ? '#2563EB' : '#D97706'
  const label  = score >= 80 ? 'Strong Match' : score >= 60 ? 'Good Match' : 'Fair Match'

  const animated     = useAnimate()
  const displayScore = useCountUp(score, 900)

  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
      <div className="relative w-[84px] h-[84px] flex items-center justify-center">
        <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90 absolute inset-0">
          <circle cx="42" cy="42" r={r} fill="none" stroke="#F1F5F9" strokeWidth="7" />
          <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeLinecap="round"
            style={{
              strokeDasharray: circ,
              strokeDashoffset: animated ? circ - filled : circ,
              transition: animated ? 'stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)' : 'none',
            }}
          />
        </svg>
        <div className="relative z-10 text-center">
          <div className="text-[22px] font-black leading-none" style={{ color }}>{displayScore}</div>
          <div className="text-[8px] font-bold tracking-[0.08em] uppercase text-gray-400 dark:text-slate-500 mt-0.5">Score</div>
        </div>
      </div>
      <span className="text-[11px] font-bold text-center" style={{ color }}>{label}</span>
    </div>
  )
}

// ── Keyword highlighter ───────────────────────────────────────────────────────

function Highlight({ text, keywords }: { text: string; keywords: string[] }) {
  if (!keywords.length || !text) return <>{text}</>
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        keywords.some(k => k.toLowerCase() === part.toLowerCase())
          ? <mark key={i} className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded px-0.5 not-italic">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

// ── Resume Preview Modal ──────────────────────────────────────────────────────

const EDIT_FIELDS = [
  { key: 'name',     label: 'Full Name',  placeholder: 'Your Name',          span: false },
  { key: 'email',    label: 'Email',      placeholder: 'you@email.com',       span: false },
  { key: 'phone',    label: 'Phone',      placeholder: '+91 98765 43210',     span: false },
  { key: 'location', label: 'Location',   placeholder: 'City, Country',       span: false },
  { key: 'linkedin', label: 'LinkedIn',   placeholder: 'linkedin.com/in/...', span: true  },
] as const

function ResumePreviewModal({
  data,
  onClose,
  onApprove,
  isSaving = false,
  avatarUrl,
  onSaveEdits,
}: {
  data: OptimizedResumeData
  onClose: () => void
  onApprove?: () => void
  isSaving?: boolean
  avatarUrl?: string | null
  onSaveEdits?: (edited: OptimizedResumeData) => void
}) {
  const [isEditing, setIsEditing]       = useState(false)
  const [editData, setEditData]         = useState<OptimizedResumeData>(data)
  const [isDownloading, setIsDownloading] = useState(false)
  const [newSkill, setNewSkill]         = useState('')

  const d        = data
  const initials = (d.name ?? '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
  const keywords = d.matched_keywords ?? []

  function enterEdit() {
    setEditData(data)
    setIsEditing(true)
  }

  function updateField(key: string, value: string) {
    setEditData(prev => ({ ...prev, [key]: value }))
  }

  function updateBullet(expIdx: number, bulletIdx: number, value: string) {
    setEditData(prev => ({
      ...prev,
      experience: prev.experience.map((exp, i) =>
        i === expIdx ? { ...exp, bullets: exp.bullets.map((b, j) => j === bulletIdx ? value : b) } : exp
      ),
    }))
  }

  function addBullet(expIdx: number) {
    setEditData(prev => ({
      ...prev,
      experience: prev.experience.map((exp, i) =>
        i === expIdx ? { ...exp, bullets: [...(exp.bullets ?? []), ''] } : exp
      ),
    }))
  }

  function removeBullet(expIdx: number, bulletIdx: number) {
    setEditData(prev => ({
      ...prev,
      experience: prev.experience.map((exp, i) =>
        i === expIdx ? { ...exp, bullets: exp.bullets.filter((_, j) => j !== bulletIdx) } : exp
      ),
    }))
  }

  function removeSkill(idx: number) {
    setEditData(prev => ({ ...prev, skills: prev.skills.filter((_, i) => i !== idx) }))
  }

  function addSkill() {
    const trimmed = newSkill.trim()
    if (!trimmed) return
    setEditData(prev => ({ ...prev, skills: [...(prev.skills ?? []), trimmed] }))
    setNewSkill('')
  }

  async function handleDownload() {
    setIsDownloading(true)
    try {
      const element = document.getElementById('resume-content')
      if (!element) throw new Error('Resume content not found')

      const [{ toPng }, { default: jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
      ])

      // Pre-convert any external <img> src to a data URL so the canvas is never
      // tainted (a tainted canvas throws SecurityError on toDataURL).
      // Route through /api/proxy-avatar so CORS is handled server-side.
      const imgEls = Array.from(element.querySelectorAll<HTMLImageElement>('img'))
      const restores: Array<() => void> = []
      await Promise.allSettled(imgEls.map(async (img) => {
        const src = img.getAttribute('src') ?? ''
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return
        try {
          const proxyUrl = `/api/proxy-avatar?url=${encodeURIComponent(src)}`
          const resp = await fetch(proxyUrl)
          if (!resp.ok) throw new Error('proxy error')
          const blob = await resp.blob()
          const dataUrl = await new Promise<string>((res, rej) => {
            const reader = new FileReader()
            reader.onload  = () => res(reader.result as string)
            reader.onerror = rej
            reader.readAsDataURL(blob)
          })
          img.src = dataUrl
          restores.push(() => { img.src = src })
        } catch {
          // Proxy failed — hide the image rather than taint the canvas
          img.removeAttribute('src')
          restores.push(() => { img.src = src })
        }
      }))

      let imgData: string
      try {
        imgData = await toPng(element, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          skipFonts: true,   // skip font-face inlining — avoids font-fetch errors
          cacheBust: true,
        })
      } finally {
        restores.forEach(r => r()) // always restore original src values
      }

      // Resolve natural dimensions from the data URL
      const naturalSize = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image()
        img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => reject(new Error('Failed to load captured image'))
        img.src = imgData
      })

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const imgH = (naturalSize.h * pdfW) / naturalSize.w
      let yPos = 0

      while (yPos < imgH) {
        pdf.addImage(imgData, 'PNG', 0, -yPos, pdfW, imgH)
        yPos += pdfH
        if (yPos < imgH) pdf.addPage()
      }

      pdf.save(`${(d.name || 'resume').replace(/\s+/g, '_')}_optimized.pdf`)
      toast.success('PDF downloaded!')
    } catch (err) {
      // DOMException properties live on the prototype and don't serialize with
      // console.error — extract them explicitly for useful logging.
      const msg = err instanceof Error
        ? err.message
        : (err && typeof err === 'object' && 'message' in err)
          ? String((err as { message: unknown }).message)
          : String(err)
      console.error('[preview] PDF failed:', msg, err)
      toast.error(`PDF generation failed: ${msg}`)
    } finally {
      setIsDownloading(false)
    }
  }

  function handleSaveChanges() {
    onSaveEdits?.(editData)
    setIsEditing(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] dark:border-[#334155] flex-shrink-0">
          <div>
            <h2 className="font-bold text-[16px] text-[#0F172A] dark:text-[#F1F5F9]">
              {isEditing ? 'Edit Resume' : 'Preview Optimized Resume'}
            </h2>
            <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {isEditing
                ? 'Edit your resume content before saving.'
                : 'Review the AI-optimized version of your resume for this job.'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {!isEditing && (
              <div className="hidden sm:flex items-center gap-3 text-[11px] text-gray-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300 dark:bg-green-900/40 dark:border-green-700 inline-block" />Added</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 dark:bg-amber-900/40 dark:border-amber-700 inline-block" />Modified</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300 dark:bg-red-900/40 dark:border-red-700 inline-block" />Removed</span>
              </div>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isEditing ? (
            /* ── Edit form ─────────────────────────────────────── */
            <div className="p-6 space-y-6">

              {/* Contact */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Contact Information</p>
                <div className="grid grid-cols-2 gap-3">
                  {EDIT_FIELDS.map(({ key, label, placeholder, span }) => (
                    <div key={key} className={span ? 'col-span-2' : ''}>
                      <label className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</label>
                      <input
                        type="text"
                        value={(editData[key] as string) ?? ''}
                        onChange={e => updateField(key, e.target.value)}
                        placeholder={placeholder}
                        className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Summary */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Professional Summary</p>
                <textarea
                  rows={4}
                  value={editData.summary ?? ''}
                  onChange={e => updateField('summary', e.target.value)}
                  placeholder="Professional summary..."
                  className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none"
                />
              </section>

              {/* Experience bullets */}
              {(editData.experience?.length ?? 0) > 0 && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Work Experience — Bullet Points</p>
                  <div className="space-y-4">
                    {editData.experience.map((exp, i) => (
                      <div key={i} className="bg-[#F8FAFC] dark:bg-[#0F172A]/60 rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-4">
                        <div className="mb-3">
                          <p className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F1F5F9]">{exp.title}</p>
                          <p className="text-[12px] text-[#2563EB] mt-0.5">{exp.company} · {exp.start_date} – {exp.end_date ?? 'Present'}</p>
                        </div>
                        <div className="space-y-2">
                          {(exp.bullets ?? []).map((bullet, j) => (
                            <div key={j} className="flex gap-2">
                              <textarea
                                rows={2}
                                value={bullet}
                                onChange={e => updateBullet(i, j, e.target.value)}
                                className="flex-1 px-3 py-2 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none"
                              />
                              <button
                                onClick={() => removeBullet(i, j)}
                                className="mt-1 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => addBullet(i)}
                            className="flex items-center gap-1.5 text-[12px] text-[#2563EB] hover:text-blue-700 font-medium mt-1"
                          >
                            <Plus className="w-3.5 h-3.5" />Add bullet
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Skills */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Skills</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(editData.skills ?? []).map((skill, i) => (
                    <span key={i} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-[#EFF6FF] dark:bg-[#1E3A5F] border border-[#DBEAFE] dark:border-[#1E3A5F] text-[12px] font-medium text-[#2563EB]">
                      {skill}
                      <button onClick={() => removeSkill(i)} className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#2563EB]/20 transition-colors">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSkill}
                    onChange={e => setNewSkill(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
                    placeholder="Add a skill..."
                    className="flex-1 px-3 py-2 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                  <button
                    onClick={addSkill}
                    className="px-4 py-2 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-medium hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </section>

              {/* Certifications */}
              {(editData.certifications?.length ?? 0) > 0 && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Certifications</p>
                  <div className="space-y-2">
                    {editData.certifications.map((cert, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={cert}
                          onChange={e => setEditData(prev => ({
                            ...prev,
                            certifications: prev.certifications.map((c, j) => j === i ? e.target.value : c),
                          }))}
                          className="flex-1 px-3 py-2 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                        />
                        <button
                          onClick={() => setEditData(prev => ({ ...prev, certifications: prev.certifications.filter((_, j) => j !== i) }))}
                          className="w-8 h-9 rounded-lg flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            /* ── Preview mode ──────────────────────────────────── */
            <div>

              {/* ── AI Insight Panel — outside resume, never in PDF ── */}
              {d.original_score != null && d.original_score < d.ats_score && (
                <div className="mx-4 mt-4 mb-3 p-5 rounded-2xl bg-green-50 border border-green-100 shadow-sm">

                  {/* Panel header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-green-600" />
                    </div>
                    <p className="font-bold text-[13px] text-green-800">ATS Score Improvement</p>
                  </div>

                  {/* Score row */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-center min-w-[52px]">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-400 mb-1">Previous</p>
                      <p className="text-[30px] font-black text-gray-300 leading-none">{d.original_score}</p>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 flex-1">
                      <div className="flex items-center gap-2 w-full">
                        <div className="flex-1 h-px bg-green-200" />
                        <span className="text-green-500 font-black text-lg leading-none">→</span>
                        <div className="flex-1 h-px bg-green-200" />
                      </div>
                      <span className="text-[11px] font-bold text-green-600">+{d.ats_score - d.original_score} pts</span>
                    </div>
                    <div className="text-center min-w-[52px]">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-green-600 mb-1">New Score</p>
                      <p className="text-[30px] font-black text-green-600 leading-none">{d.ats_score}</p>
                    </div>
                  </div>

                  {/* Impact message */}
                  {d.score_improvement_reason && (
                    <p className="text-[12px] text-green-700 italic mb-4">
                      &ldquo;{d.score_improvement_reason}&rdquo;
                    </p>
                  )}

                  {/* Key improvements list */}
                  {(d.improvements?.length ?? 0) > 0 && (
                    <div className="border-t border-green-200 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-green-700 mb-2.5">Key Improvements</p>
                      <div className="space-y-1.5">
                        {d.improvements.slice(0, 4).map((imp, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                            <span className="text-[12px] text-green-800 leading-snug">{imp.note}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Section title divider ── */}
              <div className="px-4 pt-5 pb-2">
                <h3 className="font-bold text-[17px] text-[#0F172A] dark:text-[#F1F5F9]">Optimized Resume Preview</h3>
                <div className="h-px bg-[#E5E7EB] dark:bg-[#334155] mt-2.5" />
              </div>

              {/* ── Resume content — clean, no AI elements ── */}
              <div id="resume-content" className="flex">

                {/* Dark sidebar */}
                <div className="w-[260px] flex-shrink-0 bg-[#0F172A] p-6 space-y-6">
                  <div className="text-center space-y-2">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Profile"
                        className="w-16 h-16 rounded-full object-cover mx-auto ring-2 ring-white/20"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center mx-auto">
                        <span className="text-xl font-bold text-white">{initials}</span>
                      </div>
                    )}
                    <h2 className="font-bold text-[14px] text-white leading-snug">{d.name}</h2>
                    {d.experience?.[0]?.title && (
                      <p className="text-[11px] text-blue-300 leading-snug">{d.experience[0].title}</p>
                    )}
                  </div>
                  <div className="h-px bg-white/10" />
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.18em] uppercase text-blue-400 mb-2">Contact</p>
                    <div className="h-px bg-white/10 mb-3" />
                    <div className="space-y-2">
                      {d.phone    && <div className="flex gap-2 text-[11px] text-gray-300"><span className="text-blue-400 flex-shrink-0">▸</span><span className="break-all">{d.phone}</span></div>}
                      {d.email    && <div className="flex gap-2 text-[11px] text-gray-300"><span className="text-blue-400 flex-shrink-0">▸</span><span className="break-all">{d.email}</span></div>}
                      {d.location && <div className="flex gap-2 text-[11px] text-gray-300"><span className="text-blue-400 flex-shrink-0">▸</span><span>{d.location}</span></div>}
                      {d.linkedin && <div className="flex gap-2 text-[11px] text-gray-300"><span className="text-blue-400 flex-shrink-0">▸</span><span className="break-all">{d.linkedin}</span></div>}
                    </div>
                  </div>
                  {(d.skills?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[9px] font-bold tracking-[0.18em] uppercase text-blue-400 mb-2">Key Skills</p>
                      <div className="h-px bg-white/10 mb-3" />
                      <div className="flex flex-wrap gap-1.5">
                        {d.skills.map((skill, i) => (
                          <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-medium ${i < 5 ? 'bg-[#2563EB]/20 border border-[#2563EB]/30 text-blue-200' : 'bg-white/5 border border-white/10 text-gray-300'}`}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* White content — resume only, no AI elements */}
                <div className="flex-1 bg-white p-7 space-y-7 min-w-0">

                  {/* Summary */}
                  {d.summary && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[#2563EB] leading-none text-base">◈</span>
                        <h3 className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#0F172A]">Professional Summary</h3>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>
                      <p className="text-[13px] text-gray-600 leading-relaxed">
                        <Highlight text={d.summary} keywords={keywords} />
                      </p>
                    </div>
                  )}

                  {/* Experience */}
                  {(d.experience?.length ?? 0) > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Briefcase className="w-4 h-4 text-[#2563EB]" />
                        <h3 className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#0F172A]">Work Experience</h3>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>
                      <div className="relative">
                        <div className="absolute left-2.5 top-5 bottom-2 w-px bg-[#E5E7EB]" />
                        <div className="space-y-6">
                          {d.experience.map((exp, i) => (
                            <div key={i} className="relative pl-8">
                              <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-[#2563EB] flex items-center justify-center z-10">
                                <div className="w-2 h-2 rounded-full bg-white" />
                              </div>
                              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-0.5">
                                <h4 className="font-bold text-[14px] text-[#0F172A]">{exp.title}</h4>
                                <span className="text-[11px] text-gray-400">{exp.start_date} – {exp.end_date ?? 'Present'}</span>
                              </div>
                              <p className="text-[12px] text-[#2563EB] font-semibold mb-2">{exp.company}</p>
                              {(exp.bullets ?? []).length > 0 && (
                                <ul className="space-y-1.5">
                                  {exp.bullets.map((bullet, j) => (
                                    <li key={j} className="flex gap-2 text-[12px] text-gray-600">
                                      <span className="text-[#2563EB] flex-shrink-0 mt-0.5">•</span>
                                      <span className="leading-relaxed">
                                        <Highlight text={bullet} keywords={keywords} />
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {(d.education?.length ?? 0) > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <GraduationCap className="w-4 h-4 text-[#2563EB]" />
                        <h3 className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#0F172A]">Education</h3>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>
                      <div className="space-y-2">
                        {d.education.map((edu, i) => (
                          <div key={i} className="flex items-start justify-between gap-4 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB]">
                            <div>
                              <p className="font-semibold text-[13px] text-[#0F172A]">{[edu.degree, edu.field].filter(Boolean).join(' in ')}</p>
                              <p className="text-[12px] text-[#2563EB] mt-0.5">{edu.school}</p>
                            </div>
                            <span className="text-[11px] text-gray-400 whitespace-nowrap">{edu.graduation_year}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {(d.certifications?.length ?? 0) > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                        <h3 className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#0F172A]">Certifications</h3>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>
                      <div className="space-y-2">
                        {d.certifications.map((cert, i) => (
                          <div key={i} className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            <p className="text-[13px] text-[#0F172A]">{cert}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E5E7EB] dark:border-[#334155] flex-shrink-0 bg-white dark:bg-[#1E293B]">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChanges}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />Save Changes
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors">
                Close
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={enterEdit}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />Edit Manually
                </button>
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Download PDF
                </button>
                {onApprove && (
                  <button
                    onClick={onApprove}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-100 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                  >
                    {isSaving
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                      : <><CheckCircle2 className="w-3.5 h-3.5" />Approve &amp; Save</>
                    }
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Optimized Job Card ────────────────────────────────────────────────────────

function OptimizedJobCard({
  resume,
  isActive,
  saved,
  saving,
  onViewResume,
  onDownload,
  onDelete,
  onToggleSave,
}: {
  resume: ProcessedResume
  isActive: boolean
  saved: boolean
  saving: boolean
  onViewResume: () => void
  onDownload: () => void
  onDelete: () => void
  onToggleSave: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { optimizedData: d, jobTitle, company, location, description, applyUrl, createdAt } = resume
  const tags     = (d.matched_keywords ?? []).slice(0, 5)
  const extraTags = Math.max(0, (d.matched_keywords?.length ?? 0) - 5)
  const savedDate = new Date(createdAt).toLocaleString('en-US', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm hover:shadow-md transition-all duration-200 p-6">

      {/* Top row: meta + score ring + bookmark */}
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[17px] text-[#0F172A] dark:text-[#F1F5F9] leading-snug mb-1.5">{jobTitle}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-400 dark:text-slate-500 mb-3">
            <span className="font-semibold text-gray-600 dark:text-slate-300 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-gray-400 dark:text-slate-500" />{company}
            </span>
            {location && <>
              <span className="text-gray-200 dark:text-slate-700">·</span>
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{location}</span>
            </>}
            <span className="text-gray-200 dark:text-slate-700">·</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Posted recently</span>
            <span className="text-gray-200 dark:text-slate-700">·</span>
            <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />Full-time</span>
          </div>
          {description && (
            <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed line-clamp-2 mb-4">
              {description}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 flex flex-col items-center gap-2 pt-1">
          {/* Bookmark — top of right column, same position as Job Matches card */}
          <button
            onClick={onToggleSave}
            disabled={saving}
            title={saved ? 'Remove from tracker' : 'Save to tracker'}
            className="self-end text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : saved
              ? <BookmarkCheck className="w-4 h-4 text-[#2563EB] hover:text-red-400 transition-colors" />
              : <Bookmark className="w-4 h-4" />}
          </button>
          <ATSScoreRing score={d.ats_score} />
          {d.original_score != null && d.original_score < d.ats_score && (
            <div className="flex flex-col items-center gap-1 mt-1.5">
              <span className="text-[10px] font-semibold text-green-500 dark:text-green-400">Improved from previous score</span>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-gray-400 dark:text-slate-500">Previous: <span className="font-bold">{d.original_score}</span></span>
                <span className="text-green-500 font-black">→ {d.ats_score}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Key focus tags */}
      {tags.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2">Key Focus Areas</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <span key={i} className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#E5E7EB] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#263549] text-gray-600 dark:text-slate-400">
                {tag}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#E5E7EB] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#263549] text-gray-400 dark:text-slate-500">
                +{extraTags} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bottom: timestamp + actions */}
      <div className="flex items-center justify-between pt-4 border-t border-[#F1F5F9] dark:border-[#334155] flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600" />
          <span className="text-[12px] text-gray-400 dark:text-slate-500">Saved on {savedDate}</span>
          {isActive && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
              Active (Latest)
            </span>
          )}
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-red-500 dark:text-red-400">Delete this resume?</span>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmDelete(false); onDelete() }}
              className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[12px] font-bold transition-colors"
            >
              Yes, delete
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-gray-400 dark:text-slate-500 hover:border-red-200 dark:hover:border-red-800 hover:text-red-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Delete optimized resume"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onViewResume} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors">
              <Eye className="w-3.5 h-3.5" />View Resume
            </button>
            <button onClick={onDownload} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors">
              <Download className="w-3.5 h-3.5" />Download
            </button>
            <a
              href={applyUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] hover:bg-[#1E293B] dark:hover:bg-blue-700 text-white text-[12px] font-bold transition-all hover:scale-[1.01] shadow-sm"
            >
              Apply Now <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Job Details Sidebar ───────────────────────────────────────────────────────

function JobDetailsSidebar({
  resume,
  onViewResume,
  onDownload,
}: {
  resume: ProcessedResume
  onViewResume: () => void
  onDownload: () => void
}) {
  const { jobTitle, company, location, description, applyUrl, optimizedData: d } = resume
  const initial = company[0]?.toUpperCase() ?? '?'
  const reqs    = (d.matched_keywords ?? []).slice(0, 8)
  const extra   = Math.max(0, (d.matched_keywords?.length ?? 0) - 8)

  return (
    <aside className="w-full xl:w-[320px] xl:flex-shrink-0 sticky top-6">
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm overflow-hidden">

        <div className="px-5 pt-5 pb-4 border-b border-[#F1F5F9] dark:border-[#334155]">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Job Details</p>
          <h3 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9] mb-3 leading-snug">{jobTitle}</h3>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] dark:bg-[#1E3A5F] flex items-center justify-center text-[#2563EB] font-bold text-[11px] flex-shrink-0">
              {initial}
            </div>
            <span className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{company}</span>
          </div>
          {location && (
            <div className="flex items-center gap-1.5 text-[12px] text-gray-400 dark:text-slate-500 mb-1">
              <MapPin className="w-3 h-3 flex-shrink-0" />{location}
            </div>
          )}
          <div className="flex items-center gap-3 text-[12px] text-gray-400 dark:text-slate-500">
            <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />Full-time</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Posted recently</span>
          </div>
        </div>

        {reqs.length > 0 && (
          <div className="px-5 py-4 border-b border-[#F1F5F9] dark:border-[#334155]">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Key Requirements</p>
            <div className="flex flex-wrap gap-1.5">
              {reqs.map((r, i) => (
                <span key={i} className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#E5E7EB] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#263549] text-gray-600 dark:text-slate-400">
                  {r}
                </span>
              ))}
              {extra > 0 && (
                <span className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[#E5E7EB] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#263549] text-gray-400 dark:text-slate-500">
                  +{extra} more
                </span>
              )}
            </div>
          </div>
        )}

        {description && (
          <div className="px-5 py-4 border-b border-[#F1F5F9] dark:border-[#334155]">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2">Job Summary</p>
            <p className="text-[12px] text-gray-600 dark:text-slate-400 leading-relaxed line-clamp-5">{description}</p>
          </div>
        )}

        <div className="px-5 py-4 border-b border-[#F1F5F9] dark:border-[#334155]">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Attachments</p>
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#263549] border border-[#E5E7EB] dark:border-[#334155]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Optimized Resume</p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500">Saved just now</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onViewResume} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[#334155] text-gray-400 dark:text-slate-500 transition-colors">
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDownload} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[#334155] text-gray-400 dark:text-slate-500 transition-colors">
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <a
            href={applyUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] hover:bg-[#1E293B] dark:hover:bg-blue-700 text-white text-[13px] font-bold transition-all hover:scale-[1.01] shadow-sm"
          >
            Apply Now <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </aside>
  )
}

// ── Free Preview Modal ────────────────────────────────────────────────────────

const WHAT_IMPROVED = [
  'Added relevant ATS keywords for this role',
  'Strengthened bullet point impact and specificity',
  'Aligned your experience with the job description',
  'Optimized for recruiter screening patterns',
]

function FreePreviewModal({
  data,
  beforeScore,
  improvedScore,
  onClose,
  onUpgrade,
}: {
  data: OptimizedResumeData
  beforeScore: number
  improvedScore: number
  onClose: () => void
  onUpgrade: () => void
}) {
  const delta = improvedScore - beforeScore

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl overflow-hidden z-10 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0 flex-shrink-0">
          <p className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Your Free AI Preview</p>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-6 pb-6 pt-4 space-y-4">

          {/* Score improvement */}
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-green-700 dark:text-green-400 mb-3">
              Your Match Score Improved
            </p>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-[28px] font-black text-gray-400 dark:text-slate-500 leading-none">{beforeScore}</div>
                <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 font-medium">Before</div>
              </div>
              <div className="flex-1 flex items-center justify-center gap-1">
                <div className="h-px flex-1 bg-green-200 dark:bg-green-700" />
                <span className="text-green-500 font-black text-[16px]">→</span>
                <div className="h-px flex-1 bg-green-200 dark:bg-green-700" />
              </div>
              <div className="text-center">
                <div className="flex items-end gap-1.5 justify-center">
                  <div className="text-[28px] font-black text-green-600 dark:text-green-400 leading-none">{improvedScore}</div>
                  {delta > 0 && (
                    <div className="text-[13px] font-bold text-green-500 dark:text-green-400 mb-0.5">+{delta}</div>
                  )}
                </div>
                <div className="text-[10px] text-green-600 dark:text-green-400 mt-1 font-bold">After</div>
              </div>
            </div>
          </div>

          {/* What improved */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2.5">What We Improved</p>
            <div className="space-y-2">
              {WHAT_IMPROVED.map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-[13px] text-gray-600 dark:text-slate-400">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Blurred resume teaser */}
          <div className="relative rounded-xl border border-[#E5E7EB] dark:border-[#334155] overflow-hidden" style={{ maxHeight: 140 }}>
            <div className="p-4 select-none" style={{ filter: 'blur(3.5px)', pointerEvents: 'none' }}>
              {data.summary && (
                <p className="text-[12px] text-gray-600 dark:text-slate-400 leading-relaxed mb-3">{data.summary}</p>
              )}
              {(data.experience ?? []).slice(0, 1).map((exp, i) => (
                <div key={i}>
                  <p className="font-semibold text-[12px] text-[#0F172A] dark:text-[#F1F5F9]">{exp.title} · {exp.company}</p>
                  {(exp.bullets ?? []).slice(0, 2).map((b, j) => (
                    <p key={j} className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">• {b}</p>
                  ))}
                </div>
              ))}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white dark:to-[#1E293B]" />
          </div>

          {/* CTA */}
          <div className="text-center">
            <p className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9] mb-1">Unlock your improved resume</p>
            <p className="text-[12px] text-gray-500 dark:text-slate-400 mb-4">
              Save, download, and apply with your optimized resume.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-all"
              >
                Close
              </button>
              <button
                onClick={onUpgrade}
                className="flex-1 py-2.5 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] hover:bg-[#1E293B] dark:hover:bg-blue-700 text-white text-[13px] font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Locked Job Card (free preview, not saved) ─────────────────────────────────

interface LockedPreviewState {
  jobId: string
  jobTitle: string
  company: string
  location: string
  description: string
  applyUrl: string
  salary?: string | null
  optimizedData: OptimizedResumeData
  beforeScore: number
  improvedScore: number
}

function LockedJobCard({
  preview,
  onViewPreview,
  onUpgrade,
}: {
  preview: LockedPreviewState
  onViewPreview: () => void
  onUpgrade: () => void
}) {
  const { jobTitle, company, location, description, improvedScore } = preview
  const r      = 36
  const circ   = 2 * Math.PI * r
  const filled = (improvedScore / 100) * circ
  const color  = improvedScore >= 80 ? '#16A34A' : improvedScore >= 60 ? '#2563EB' : '#D97706'
  const tierLabel = improvedScore >= 80 ? 'Strong Match' : improvedScore >= 60 ? 'Good Match' : 'Fair Match'

  const animated       = useAnimate()
  const displayScore   = useCountUp(improvedScore, 900)

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6">
      <div className="flex gap-6">

        {/* Left + middle */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[17px] leading-snug text-[#0F172A] dark:text-[#F1F5F9] mb-1.5 pr-2">
            {jobTitle}
          </h3>

          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[13px] text-gray-400 dark:text-slate-500 mb-3">
            <span className="font-semibold text-gray-600 dark:text-slate-300 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-gray-400 dark:text-slate-500" />{company}
            </span>
            {location && (
              <>
                <span className="text-gray-200 dark:text-slate-700">·</span>
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{location}</span>
              </>
            )}
            <span className="text-gray-200 dark:text-slate-700">·</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Posted recently</span>
            <span className="text-gray-200 dark:text-slate-700">·</span>
            <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />Full-time</span>
          </div>

          {description && (
            <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed line-clamp-2 mb-4">
              {description}
            </p>
          )}

          {/* Status badge */}
          <div className="flex items-center gap-2 mb-5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400">
              <Sparkles className="w-3 h-3" />Preview Generated
            </span>
            <span className="text-[11px] text-gray-400 dark:text-slate-500">Upgrade to save &amp; download</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onViewPreview}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#2563EB] text-[#2563EB] text-[12px] font-semibold hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A5F] transition-all hover:scale-[1.02] active:scale-100"
            >
              <Eye className="w-3.5 h-3.5" />View Preview
            </button>
            <button
              onClick={onUpgrade}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] hover:bg-[#1E293B] dark:hover:bg-blue-700 text-white text-[12px] font-semibold transition-all hover:scale-[1.02] active:scale-100"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />Upgrade to Unlock
            </button>
            <button
              disabled
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-300 dark:text-slate-600 cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />Download
            </button>
          </div>
        </div>

        {/* Right: score ring */}
        <div className="flex flex-col items-center gap-2 min-w-[100px] w-[100px] flex-shrink-0">
          <div className="relative w-[84px] h-[84px] flex items-center justify-center">
            <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90 absolute inset-0">
              <circle cx="42" cy="42" r={r} fill="none" stroke="#F1F5F9" strokeWidth="7" />
              <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="7"
                strokeLinecap="round"
                style={{
                  strokeDasharray: circ,
                  strokeDashoffset: animated ? circ - filled : circ,
                  transition: animated ? 'stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)' : 'none',
                }}
              />
            </svg>
            <div className="relative z-10 text-center">
              <div className="text-[22px] font-black leading-none" style={{ color }}>{displayScore}</div>
              <div className="text-[8px] font-bold tracking-[0.08em] uppercase text-gray-400 dark:text-slate-500 mt-0.5">Score</div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-center" style={{ color }}>{tierLabel}</span>
          <span className="text-[10px] text-gray-400 dark:text-slate-500 text-center leading-tight font-medium">Preview Available</span>
        </div>
      </div>
    </div>
  )
}

// ── Main content ──────────────────────────────────────────────────────────────

function OptimizerContent() {
  const searchParams  = useSearchParams()
  const router        = useRouter()
  const jobId         = searchParams.get('jobId') ?? ''

  const [step, setStep]                               = useState(0)
  const [optimizeError, setOptimizeError]             = useState<string | null>(null)
  const [pendingOptimization, setPendingOptimization] = useState<PendingOptimization | null>(null)
  const [lockedPreview, setLockedPreviewRaw]          = useState<LockedPreviewState | null>(null)
  const [showPreviewPopup, setShowPreviewPopup]       = useState(false)
  const [showPaywall, setShowPaywall]                 = useState(false)
  const [previewResume, setPreviewResume]             = useState<OptimizedResumeData | null>(null)
  const [isSaving, setIsSaving]                       = useState(false)
  const [downloading, setDownloading]                 = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl]                     = useState<string | null>(null)
  const autoTriggered                                 = useRef(false)

  function setLockedPreview(state: LockedPreviewState | null) {
    setLockedPreviewRaw(state)
    try {
      if (state) localStorage.setItem('faj_preview', JSON.stringify(state))
      else localStorage.removeItem('faj_preview')
    } catch { /* storage unavailable */ }
  }

  const { data: profileData }            = useSWR('/api/profile', fetcher)
  const { data: savedData, mutate }      = useSWR('/api/resume/optimize', fetcher)
  const { data: appsData }               = useSWR('/api/applications', fetcher)

  const isPro = profileData?.plan === 'pro'

  const savedJobIds = useMemo(() => {
    const ids = new Set<string>()
    for (const app of (appsData?.applications ?? [])) {
      if (app.job?.id) ids.add(app.job.id)
    }
    return ids
  }, [appsData])

  const savedJobToAppId = useMemo(() => {
    const map = new Map<string, string>()
    for (const app of (appsData?.applications ?? [])) {
      if (app.job?.id && app.id) map.set(app.job.id, app.id)
    }
    return map
  }, [appsData])

  const [savingJobId, setSavingJobId] = useState<string | null>(null)

  async function handleToggleSave(jobId: string) {
    if (savingJobId) return
    setSavingJobId(jobId)
    try {
      const appId = savedJobToAppId.get(jobId)
      if (appId) {
        const res = await fetch(`/api/applications?id=${appId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        toast.success('Removed from tracker')
      } else {
        const res = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, status: 'saved' }),
        })
        if (!res.ok) throw new Error()
        toast.success('Saved to tracker')
      }
      globalMutate('/api/applications')
    } catch {
      toast.error('Failed to update tracker')
    } finally {
      setSavingJobId(null)
    }
  }

  useEffect(() => {
    const supabase = createBrowserClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', user.id)
        .single()
      setAvatarUrl(resolveAvatar(profile, user))
    })
    // Restore locked preview across page refreshes
    try {
      const raw = localStorage.getItem('faj_preview')
      if (raw) setLockedPreviewRaw(JSON.parse(raw) as LockedPreviewState)
    } catch { /* storage unavailable */ }
  }, [])

  // Pro users should never see free-preview UI — clear stale localStorage state
  useEffect(() => {
    if (isPro && lockedPreview) {
      setLockedPreview(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro])

  const savedResumes: ProcessedResume[] = useMemo(() => {
    return (savedData?.resumes ?? []).map((r: RawSavedResume) => parseRaw(r))
  }, [savedData])

  const allResumes = savedResumes

  // Wait for savedData to load, then only auto-trigger if this job isn't already optimized (Rule 4)
  useEffect(() => {
    if (!jobId) return
    if (savedData === undefined) return          // not loaded yet — wait
    if (autoTriggered.current) return            // already ran once

    const alreadyOptimized = (savedData?.resumes ?? []).some(
      (r: RawSavedResume) => r.job_id === jobId
    )
    if (alreadyOptimized) return                 // Rule 4: DO NOTHING

    autoTriggered.current = true
    handleOptimize()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, savedData])

  async function handleOptimize() {
    if (!jobId) { toast.error('No job selected. Go to Job Matches and click "Optimize Resume".'); return }

    // Clear previous state, start progress
    setOptimizeError(null)
    setStep(1)
    await new Promise(r => setTimeout(r, 900))
    setStep(2)

    let res: Response
    let data: Record<string, unknown>

    try {
      res  = await fetch('/api/resume/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      data = await res.json()
    } catch {
      // Network / parse failure — stay on progress screen and show error card
      setOptimizeError('Network error — please check your connection and try again.')
      setStep(0)
      return
    }

    if (!res.ok) {
      if (res.status === 402 && (data.requiresUpgrade as boolean)) {
        setStep(0)
        setShowPaywall(true)
        return
      }
      setOptimizeError((data.error as string) ?? 'Optimization failed. Please try again.')
      setStep(0)
      return
    }

    setStep(3)
    await new Promise(r => setTimeout(r, 600))

    const pending: PendingOptimization = {
      jobId,
      jobTitle: data.jobTitle as string,
      company: data.company as string,
      location: (data.location as string) ?? '',
      description: (data.description as string) ?? '',
      applyUrl: (data.applyUrl as string) ?? '',
      salary: data.salary as string | null,
      optimizedData: data.optimizedData as OptimizedResumeData,
    }

    if (data.isFreePreview) {
      const optimized = pending.optimizedData
      setLockedPreview({
        jobId:         pending.jobId,
        jobTitle:      pending.jobTitle,
        company:       pending.company,
        location:      pending.location,
        description:   pending.description,
        applyUrl:      pending.applyUrl,
        salary:        pending.salary,
        optimizedData: optimized,
        beforeScore:   optimized.original_score ?? 0,
        improvedScore: optimized.ats_score,
      })
      setShowPreviewPopup(true)
    } else {
      setPendingOptimization(pending)
    }
    setStep(0)
  }

  async function handleApprove() {
    if (!pendingOptimization) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/resume/optimize/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: pendingOptimization.jobId,
          optimizedData: pendingOptimization.optimizedData,
        }),
      })
      const saved = await res.json()
      if (!res.ok) {
        toast.error((saved.error as string) ?? 'Failed to save resume.')
        return
      }
      setPendingOptimization(null)
      await mutate()
      toast.success('Resume saved!')
    } catch {
      toast.error('Failed to save. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  function handleSaveEdits(edited: OptimizedResumeData) {
    setPendingOptimization(prev => prev ? { ...prev, optimizedData: edited } : prev)
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/resume/optimize?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json()
        toast.error(error ?? 'Failed to delete.')
        return
      }
      await mutate()
      toast.success('Resume deleted.')
    } catch {
      toast.error('Failed to delete. Please try again.')
    }
  }

  async function handleDownload(resume: ProcessedResume) {
    setDownloading(resume.id)
    try {
      const [pdfAvatarUrl, { pdf }, { createElement }, { ResumePDF }] = await Promise.all([
        avatarUrl ? toDataUri(avatarUrl) : Promise.resolve(null),
        import('@react-pdf/renderer'),
        import('react'),
        import('@/components/resume/ResumePDF'),
      ])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await (pdf as any)(createElement(ResumePDF, { data: resume.optimizedData, avatarUrl: pdfAvatarUrl } as any) as any).toBlob()
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), {
        href: url,
        download: `${(resume.optimizedData.name || 'resume').replace(/\s+/g, '_')}_${resume.jobTitle.replace(/\s+/g, '_')}.pdf`,
      })
      document.body.appendChild(a); a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded!')
    } catch (err) {
      console.error('[optimizer] PDF failed:', err)
      toast.error('PDF generation failed.')
    } finally {
      setDownloading(null)
    }
  }

  const isLoading = step > 0

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2 leading-tight">
            Resume Optimizer
            <Sparkles className="w-4 h-4 text-amber-400" />
          </h1>
          <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">
            AI tailors your resume to match the job — stronger bullets, ATS keywords, higher match score.
          </p>
        </div>
        {jobId && allResumes.length > 0 && !isLoading && (
          <button
            onClick={() => { autoTriggered.current = false; handleOptimize() }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#1E293B] hover:shadow-sm transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />Re-analyze
          </button>
        )}
      </div>

      {/* ── No job (empty state) ─────────────────────────────────── */}
      {!jobId && allResumes.length === 0 && !lockedPreview && !isLoading && (
        <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-[#1E293B] rounded-2xl border border-dashed border-[#E5E7EB] dark:border-[#334155] text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F8FAFC] dark:bg-[#263549] flex items-center justify-center mb-4">
            <Wand2 className="w-6 h-6 text-gray-300 dark:text-slate-600" />
          </div>
          <p className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">No job selected</p>
          <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1">
            Go to{' '}
            <a href="/matches" className="text-[#2563EB] font-semibold hover:underline">Job Matches</a>
            {' '}and click &ldquo;Optimize Resume&rdquo; on any listing.
          </p>
        </div>
      )}

      {/* ── Progress / Error modal ───────────────────────────────── */}
      {(isLoading || optimizeError) && (
        <ProgressModal
          step={step}
          error={optimizeError}
          onRetry={() => { setOptimizeError(null); autoTriggered.current = false; handleOptimize() }}
          onClose={() => setOptimizeError(null)}
        />
      )}

      {/* ── Results layout ───────────────────────────────────────── */}
      {!isLoading && allResumes.length > 0 && (
        <div className="space-y-5">

          {/* Section header */}
          <div>
            <h2 className="font-bold text-[17px] text-[#0F172A] dark:text-[#F1F5F9]">Optimized Resumes</h2>
            <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">View and manage your AI-optimized resumes for different jobs.</p>
          </div>

          {/* Cards */}
          <div className="space-y-4">
            {allResumes.map((resume) => (
              <OptimizedJobCard
                key={resume.id}
                resume={resume}
                isActive={resume.id === allResumes[0].id}
                saved={savedJobIds.has(resume.jobId)}
                saving={savingJobId === resume.jobId}
                onToggleSave={() => handleToggleSave(resume.jobId)}
                onViewResume={() => setPreviewResume(resume.optimizedData)}
                onDownload={() => handleDownload(resume)}
                onDelete={() => handleDelete(resume.id)}
              />
            ))}
          </div>

          {/* Optimize for another job */}
          <button
            onClick={() => router.push('/matches')}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-400 dark:text-slate-500 hover:border-[#2563EB]/50 hover:text-[#2563EB] dark:hover:text-blue-400 hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] transition-all"
          >
            <Plus className="w-4 h-4" />Optimize for Another Job
          </button>
        </div>
      )}

      {/* ── Locked preview card (free user, popup closed) ───────── */}
      {!isLoading && lockedPreview && allResumes.length === 0 && !isPro && (
        <div className="space-y-4">
          <div>
            <h2 className="font-bold text-[17px] text-[#0F172A] dark:text-[#F1F5F9]">AI Optimization Preview</h2>
            <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">Your resume has been optimized — upgrade to save and download.</p>
          </div>
          <LockedJobCard
            preview={lockedPreview}
            onViewPreview={() => setShowPreviewPopup(true)}
            onUpgrade={() => setShowPaywall(true)}
          />
        </div>
      )}

      {/* ── Pending optimization — user must approve to save ─────── */}
      {pendingOptimization && (
        <ResumePreviewModal
          data={pendingOptimization.optimizedData}
          onClose={() => setPendingOptimization(null)}
          onApprove={handleApprove}
          isSaving={isSaving}
          avatarUrl={avatarUrl}
          onSaveEdits={handleSaveEdits}
        />
      )}

      {/* ── Free preview popup ───────────────────────────────────── */}
      {showPreviewPopup && lockedPreview && !isPro && (
        <FreePreviewModal
          data={lockedPreview.optimizedData}
          beforeScore={lockedPreview.beforeScore}
          improvedScore={lockedPreview.improvedScore}
          onClose={() => setShowPreviewPopup(false)}
          onUpgrade={() => { setShowPreviewPopup(false); setShowPaywall(true) }}
        />
      )}

      {/* ── View saved resume ─────────────────────────────────────── */}
      {previewResume && (
        <ResumePreviewModal
          data={previewResume}
          onClose={() => setPreviewResume(null)}
          avatarUrl={avatarUrl}
          onSaveEdits={(edited) => setPreviewResume(edited)}
        />
      )}

      {/* ── Paywall ───────────────────────────────────────────────── */}
      {showPaywall && !isPro && (
        <PaywallModal
          onClose={() => setShowPaywall(false)}
          onMaybeLater={() => { setShowPaywall(false); router.push('/matches') }}
        />
      )}
    </div>
  )
}

export default function OptimizerPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300 dark:text-slate-600" />
      </div>
    }>
      <OptimizerContent />
    </Suspense>
  )
}
