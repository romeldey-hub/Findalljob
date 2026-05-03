'use client'

import { useState } from 'react'
import {
  Loader2, Download, X, CheckCircle2, FileText, Plus, Check,
  Briefcase, GraduationCap, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

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

// ── Edit fields ───────────────────────────────────────────────────────────────

const EDIT_FIELDS = [
  { key: 'name',     label: 'Full Name',  placeholder: 'Your Name',          span: false },
  { key: 'email',    label: 'Email',      placeholder: 'you@email.com',       span: false },
  { key: 'phone',    label: 'Phone',      placeholder: '+91 98765 43210',     span: false },
  { key: 'location', label: 'Location',   placeholder: 'City, Country',       span: false },
  { key: 'linkedin', label: 'LinkedIn',   placeholder: 'linkedin.com/in/...', span: true  },
] as const

// ── Component ─────────────────────────────────────────────────────────────────

export function ResumePreviewModal({
  data,
  onClose,
  onApprove,
  isSaving = false,
  avatarUrl,
  onSaveEdits,
  approveLabel = 'Approve & Save',
  heading = 'Preview Optimized Resume',
  previewSubtitle,
}: {
  data: OptimizedResumeData
  onClose: () => void
  onApprove?: () => void
  isSaving?: boolean
  avatarUrl?: string | null
  onSaveEdits?: (edited: OptimizedResumeData) => void
  approveLabel?: string
  heading?: string
  previewSubtitle?: string
}) {
  const [isEditing, setIsEditing]         = useState(false)
  const [editData, setEditData]           = useState<OptimizedResumeData>(data)
  const [isDownloading, setIsDownloading] = useState(false)
  const [newSkill, setNewSkill]           = useState('')

  const d        = data
  const initials = (d.name ?? '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
  const keywords = d.matched_keywords ?? []

  // Derive the inner section title from heading: "Preview Improved Resume" → "Improved Resume Preview"
  const innerTitle = heading.startsWith('Preview ')
    ? heading.slice('Preview '.length) + ' Preview'
    : 'Optimized Resume Preview'

  const subtitle = previewSubtitle ?? (
    onApprove
      ? 'Review the AI-optimized version of your resume for this job.'
      : 'Review the AI-improved version of your resume.'
  )

  function enterEdit() { setEditData(data); setIsEditing(true) }

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

      const imgEls = Array.from(element.querySelectorAll<HTMLImageElement>('img'))
      const restores: Array<() => void> = []
      await Promise.allSettled(imgEls.map(async (img) => {
        const src = img.getAttribute('src') ?? ''
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return
        try {
          const resp = await fetch(`/api/proxy-avatar?url=${encodeURIComponent(src)}`)
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
          img.removeAttribute('src')
          restores.push(() => { img.src = src })
        }
      }))

      let imgData: string
      try {
        imgData = await toPng(element, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true, cacheBust: true })
      } finally {
        restores.forEach(r => r())
      }

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
      const msg = err instanceof Error ? err.message
        : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message)
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
              {isEditing ? 'Edit Resume' : heading}
            </h2>
            <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {isEditing ? 'Edit your resume content before saving.' : subtitle}
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
            <div className="p-6 space-y-6">
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
            <div>
              {/* AI Insight Panel */}
              {d.original_score != null && d.original_score < d.ats_score && (
                <div className="mx-4 mt-4 mb-3 p-5 rounded-2xl bg-green-50 border border-green-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-green-600" />
                    </div>
                    <p className="font-bold text-[13px] text-green-800">ATS Score Improvement</p>
                  </div>
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
                  {d.score_improvement_reason && (
                    <p className="text-[12px] text-green-700 italic mb-4">&ldquo;{d.score_improvement_reason}&rdquo;</p>
                  )}
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

              <div className="px-4 pt-5 pb-2">
                <h3 className="font-bold text-[17px] text-[#0F172A] dark:text-[#F1F5F9]">{innerTitle}</h3>
                <div className="h-px bg-[#E5E7EB] dark:bg-[#334155] mt-2.5" />
              </div>

              <div id="resume-content" className="flex">
                {/* Dark sidebar */}
                <div
                  className="bg-[#0F172A]"
                  style={{
                    width: '260px', flexShrink: 0, padding: '24px',
                    display: 'flex', flexDirection: 'column', gap: '20px',
                    boxSizing: 'border-box', overflow: 'visible',
                  }}
                >
                  {/* Avatar + name */}
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Profile" className="w-16 h-16 rounded-full object-cover ring-2 ring-white/20" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center">
                        <span className="text-xl font-bold text-white">{initials}</span>
                      </div>
                    )}
                    <h2
                      className="font-bold text-white"
                      style={{ fontSize: '14px', lineHeight: '1.4', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                    >
                      {d.name}
                    </h2>
                    {d.experience?.[0]?.title && (
                      <p
                        className="text-blue-300"
                        style={{ fontSize: '11px', lineHeight: '1.4', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                      >
                        {d.experience[0].title}
                      </p>
                    )}
                  </div>

                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)' }} />

                  {/* Contact */}
                  <div>
                    <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#60A5FA', marginBottom: '8px' }}>
                      Contact
                    </p>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', marginBottom: '12px' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {d.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{ color: '#60A5FA', flexShrink: 0, fontSize: '11px' }}>▸</span>
                          {/* Phone must never wrap — shrink font if needed */}
                          <span style={{ fontSize: '11px', color: '#D1D5DB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 0' }}>
                            {d.phone}
                          </span>
                        </div>
                      )}
                      {d.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{ color: '#60A5FA', flexShrink: 0, fontSize: '11px' }}>▸</span>
                          {/* Email never wraps — smaller font + ellipsis for very long addresses */}
                          <span style={{ fontSize: '10px', color: '#D1D5DB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 0' }}>
                            {d.email}
                          </span>
                        </div>
                      )}
                      {d.location && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 }}>
                          <span style={{ color: '#60A5FA', flexShrink: 0, fontSize: '11px', lineHeight: '1.5' }}>▸</span>
                          <span style={{ fontSize: '11px', color: '#D1D5DB', lineHeight: '1.5', wordBreak: 'break-word', overflowWrap: 'anywhere', minWidth: 0 }}>
                            {d.location}
                          </span>
                        </div>
                      )}
                      {d.linkedin && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 }}>
                          <span style={{ color: '#60A5FA', flexShrink: 0, fontSize: '11px', lineHeight: '1.5' }}>▸</span>
                          <span style={{ fontSize: '10px', color: '#D1D5DB', lineHeight: '1.5', wordBreak: 'break-word', overflowWrap: 'anywhere', minWidth: 0 }}>
                            {d.linkedin}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Skills */}
                  {(d.skills?.length ?? 0) > 0 && (
                    <div>
                      <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#60A5FA', marginBottom: '8px' }}>
                        Key Skills
                      </p>
                      <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', marginBottom: '12px' }} />
                      {/* flex-wrap grid: each tag adapts width to content, wraps cleanly */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {d.skills.map((skill, i) => (
                          <span
                            key={i}
                            style={{
                              padding: '5px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 500,
                              lineHeight: '1.4',
                              maxWidth: '100%',
                              wordBreak: 'break-word',
                              whiteSpace: 'normal',
                              boxSizing: 'border-box',
                              ...(i < 5
                                ? { background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.3)', color: '#BFDBFE' }
                                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#D1D5DB' }),
                            }}
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* White content */}
                <div className="flex-1 bg-white p-7 min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                  {d.summary && (
                    <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[#2563EB] leading-none text-base flex-shrink-0">◈</span>
                        <h3 className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#0F172A] leading-[1.4]">Professional Summary</h3>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>
                      <p className="text-[13px] text-gray-600" style={{ lineHeight: '1.65', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        <Highlight text={d.summary} keywords={keywords} />
                      </p>
                    </div>
                  )}
                  {(d.experience?.length ?? 0) > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Briefcase className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
                        <h3 className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#0F172A] leading-[1.4]">Work Experience</h3>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>
                      <div className="relative">
                        <div className="absolute left-2.5 top-5 bottom-2 w-px bg-[#E5E7EB]" aria-hidden="true" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                          {d.experience.map((exp, i) => (
                            <div key={i} className="relative pl-8" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                              <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-[#2563EB] flex items-center justify-center z-10 flex-shrink-0">
                                <div className="w-2 h-2 rounded-full bg-white" />
                              </div>
                              {/* Title + date: flex-start so date pins to top when title wraps */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
                                <h4 className="font-bold text-[14px] text-[#0F172A]" style={{ lineHeight: '1.4', wordBreak: 'break-word', overflowWrap: 'anywhere', minWidth: 0, flex: '1 1 0' }}>
                                  {exp.title}
                                </h4>
                                <span className="text-[11px] text-gray-400" style={{ whiteSpace: 'nowrap', flexShrink: 0, paddingTop: '2px' }}>
                                  {exp.start_date} – {exp.end_date ?? 'Present'}
                                </span>
                              </div>
                              <p className="text-[12px] text-[#2563EB] font-semibold mb-3" style={{ lineHeight: '1.4', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                {exp.company}
                              </p>
                              {(exp.bullets ?? []).length > 0 && (
                                <ul style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {exp.bullets.map((bullet, j) => (
                                    <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                      <span className="text-[#2563EB] flex-shrink-0" style={{ marginTop: '2px', lineHeight: '1.65', fontSize: '12px' }}>•</span>
                                      <span className="text-[12px] text-gray-600" style={{ lineHeight: '1.65', wordBreak: 'break-word', overflowWrap: 'anywhere', minWidth: 0 }}>
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
                  {(d.education?.length ?? 0) > 0 && (
                    <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <GraduationCap className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
                        <h3 className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#0F172A] leading-[1.4]">Education</h3>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {d.education.map((edu, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', padding: '14px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #E5E7EB', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                            <div style={{ minWidth: 0, flex: '1 1 0' }}>
                              <p className="font-semibold text-[13px] text-[#0F172A]" style={{ lineHeight: '1.4', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                {[edu.degree, edu.field].filter(Boolean).join(' in ')}
                              </p>
                              <p className="text-[12px] text-[#2563EB] mt-0.5" style={{ lineHeight: '1.4', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                {edu.school}
                              </p>
                            </div>
                            <span className="text-[11px] text-gray-400" style={{ whiteSpace: 'nowrap', flexShrink: 0, paddingTop: '2px' }}>
                              {edu.graduation_year}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(d.certifications?.length ?? 0) > 0 && (
                    <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
                        <h3 className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#0F172A] leading-[1.4]">Certifications</h3>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {d.certifications.map((cert, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #E5E7EB', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" style={{ marginTop: '2px' }} />
                            <p className="text-[13px] text-[#0F172A]" style={{ lineHeight: '1.5', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{cert}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(d.additionalSections?.length ?? 0) > 0 && d.additionalSections!.map((section, idx) => (
                    <div key={idx} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
                        <h3 className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#0F172A] leading-[1.4]">{section.title}</h3>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>
                      <p className="text-[13px] text-gray-600 whitespace-pre-line" style={{ lineHeight: '1.65', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{section.content}</p>
                    </div>
                  ))}
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
                      : <><CheckCircle2 className="w-3.5 h-3.5" />{approveLabel}</>
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
