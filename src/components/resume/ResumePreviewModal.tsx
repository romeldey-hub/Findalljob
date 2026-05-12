'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Loader2, Download, X, CheckCircle2, FileText, Plus, Check,
  Briefcase, GraduationCap, Sparkles, Wand2, BriefcaseBusiness,
  ChevronUp, ChevronDown, Trash2, AlignLeft, List, Table2, Lock, Crown,
} from 'lucide-react'
import { toast } from 'sonner'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'
import type { ResumeSection } from '@/types'

// ── Inline AI assist helper ───────────────────────────────────────────────────

type AIAction = 'improve' | 'shorten' | 'strengthen' | 'add_bullet'

async function aiAssist(action: AIAction, text: string, context?: string): Promise<string> {
  const res = await fetch('/api/resume/ai-assist', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, text, context }),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data.requiresUpgrade
      ? 'Out of AI credits. Upgrade to Pro to continue using AI writing tools.'
      : (data.error ?? 'AI assist failed')
    throw new Error(msg)
  }
  return data.result as string
}

// ── Small AI action buttons ───────────────────────────────────────────────────

function AIBtn({
  label,
  loading,
  onClick,
}: {
  label:   string
  loading: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border border-violet-200 dark:border-violet-800/60 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
      {label}
    </button>
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

// ── Section content renderer (shared between preview and PDF export) ─────────

function SectionContentPreview({ section }: { section: ResumeSection }) {
  const type = section.type ?? 'text'
  if (type === 'bullets' && (section.items?.length ?? 0) > 0) {
    return (
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {section.items!.map((item, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <span className="text-[#2563EB] flex-shrink-0" style={{ marginTop: '2px', fontSize: '12px' }}>•</span>
            <span className="text-[13px] text-gray-600" style={{ lineHeight: '1.65', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{item}</span>
          </li>
        ))}
      </ul>
    )
  }
  if (type === 'keyvalue' && (section.pairs?.length ?? 0) > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {section.pairs!.map((pair, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="text-[12px] font-semibold text-[#0F172A]" style={{ minWidth: '110px', flexShrink: 0 }}>{pair.key}</span>
            <span className="text-[12px] text-gray-500" style={{ flexShrink: 0 }}>:</span>
            <span className="text-[12px] text-gray-600" style={{ lineHeight: '1.65', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{pair.value}</span>
          </div>
        ))}
      </div>
    )
  }
  // Default: plain text (including fallback for bullets/keyvalue with no data)
  return (
    <p className="text-[13px] text-gray-600 whitespace-pre-line" style={{ lineHeight: '1.65', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
      {section.content}
    </p>
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
  onSaveAndFindJobs,
  approveLabel = 'Approve & Save',
  heading = 'Preview Optimized Resume',
  previewSubtitle,
  startInEditMode = false,
  mode = 'edit',
  canDownload = true,
  isFreePreview = false,
  isOptimizedPreview = false,
  onLockedDownload,
  onUnlock,
  autoDownload = false,
  viewMode = false,
}: {
  data: OptimizedResumeData
  onClose: () => void
  onApprove?: () => void
  isSaving?: boolean
  avatarUrl?: string | null
  onSaveEdits?: (edited: OptimizedResumeData) => Promise<void> | void
  onSaveAndFindJobs?: (edited: OptimizedResumeData) => Promise<void>
  approveLabel?: string
  heading?: string
  previewSubtitle?: string
  startInEditMode?: boolean
  mode?: 'edit' | 'create'
  canDownload?: boolean
  isFreePreview?: boolean
  isOptimizedPreview?: boolean
  onLockedDownload?: () => void
  onUnlock?: () => void
  autoDownload?: boolean
  /** True when opened from "View Optimized Resume" on the job card (not from a fresh optimization run) */
  viewMode?: boolean
}) {
  const [isEditing, setIsEditing]         = useState(startInEditMode)
  const [editData, setEditData]           = useState<OptimizedResumeData>(data)
  const [isDownloading, setIsDownloading] = useState(false)
  const [newSkill, setNewSkill]           = useState('')
  const [isSavingJobs, setIsSavingJobs]   = useState(false)
  const [aiLoading, setAILoading]         = useState<Record<string, boolean>>({})
  // Tracks whether the user edited and saved from viewMode — switches footer from Close to Save
  const [hasLocalEdits, setHasLocalEdits] = useState(false)

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

  const editHeading = mode === 'create' ? heading : 'Edit Resume'
  const editSubtitle = mode === 'create'
    ? 'Review your AI-generated resume. Edit any field, then save to find matching jobs.'
    : 'Edit your resume content before saving.'

  function enterEdit() { setEditData(data); setIsEditing(true) }

  function setAI(key: string, val: boolean) {
    setAILoading(prev => ({ ...prev, [key]: val }))
  }

  async function handleAISummary(action: AIAction) {
    const key = `summary_${action}`
    setAI(key, true)
    try {
      const result = await aiAssist(action, editData.summary ?? '')
      setEditData(prev => ({ ...prev, summary: result }))
      toast.success('Summary updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI assist failed')
    } finally {
      setAI(key, false)
    }
  }

  async function handleAIBullet(expIdx: number, bulletIdx: number, action: AIAction) {
    const key = `exp_${expIdx}_bullet_${bulletIdx}_${action}`
    setAI(key, true)
    try {
      const bullet = editData.experience[expIdx].bullets[bulletIdx]
      const result = await aiAssist(action, bullet)
      updateBullet(expIdx, bulletIdx, result)
      toast.success('Bullet updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI assist failed')
    } finally {
      setAI(key, false)
    }
  }

  async function handleAIAddBullet(expIdx: number) {
    const key = `exp_${expIdx}_add`
    setAI(key, true)
    try {
      const existing = editData.experience[expIdx].bullets.join('\n')
      const result   = await aiAssist('add_bullet', existing, existing)
      addBullet(expIdx)
      // After adding, update the last bullet with the AI-generated text
      setEditData(prev => ({
        ...prev,
        experience: prev.experience.map((exp, i) => {
          if (i !== expIdx) return exp
          const bullets = [...exp.bullets]
          bullets[bullets.length - 1] = result
          return { ...exp, bullets }
        }),
      }))
      toast.success('Bullet added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI assist failed')
    } finally {
      setAI(key, false)
    }
  }

  async function handleSaveAndFindJobs() {
    if (!onSaveAndFindJobs) return
    setIsSavingJobs(true)
    try {
      await onSaveAndFindJobs(editData)
    } finally {
      setIsSavingJobs(false)
    }
  }

  function updateField(key: string, value: string) {
    setEditData(prev => ({ ...prev, [key]: value }))
  }

  function updateExpField(expIdx: number, key: string, value: string) {
    setEditData(prev => ({
      ...prev,
      experience: prev.experience.map((exp, i) => i === expIdx ? { ...exp, [key]: value } : exp),
    }))
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

  function updateEduField(eduIdx: number, key: string, value: string) {
    setEditData(prev => ({
      ...prev,
      education: prev.education.map((edu, i) => i === eduIdx ? { ...edu, [key]: value } : edu),
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

  // ── Custom section helpers ─────────────────────────────────────────────────

  function addCustomSection() {
    setEditData(prev => ({
      ...prev,
      additionalSections: [
        ...(prev.additionalSections ?? []),
        { title: '', content: '', type: 'text' as const, items: [], pairs: [] },
      ],
    }))
  }

  function removeCustomSection(idx: number) {
    setEditData(prev => ({
      ...prev,
      additionalSections: (prev.additionalSections ?? []).filter((_, i) => i !== idx),
    }))
  }

  function updateCustomSection(idx: number, updates: Partial<ResumeSection>) {
    setEditData(prev => ({
      ...prev,
      additionalSections: (prev.additionalSections ?? []).map((s, i) =>
        i === idx ? { ...s, ...updates } : s
      ),
    }))
  }

  function moveCustomSection(idx: number, dir: -1 | 1) {
    setEditData(prev => {
      const secs   = [...(prev.additionalSections ?? [])]
      const target = idx + dir
      if (target < 0 || target >= secs.length) return prev
      ;[secs[idx], secs[target]] = [secs[target], secs[idx]]
      return { ...prev, additionalSections: secs }
    })
  }

  function addSectionItem(idx: number) {
    setEditData(prev => ({
      ...prev,
      additionalSections: (prev.additionalSections ?? []).map((s, i) =>
        i === idx ? { ...s, items: [...(s.items ?? []), ''] } : s
      ),
    }))
  }

  function removeSectionItem(idx: number, j: number) {
    setEditData(prev => ({
      ...prev,
      additionalSections: (prev.additionalSections ?? []).map((s, i) =>
        i === idx ? { ...s, items: (s.items ?? []).filter((_, k) => k !== j) } : s
      ),
    }))
  }

  function updateSectionItem(idx: number, j: number, value: string) {
    setEditData(prev => ({
      ...prev,
      additionalSections: (prev.additionalSections ?? []).map((s, i) =>
        i === idx
          ? { ...s, items: (s.items ?? []).map((it, k) => k === j ? value : it) }
          : s
      ),
    }))
  }

  function addSectionPair(idx: number) {
    setEditData(prev => ({
      ...prev,
      additionalSections: (prev.additionalSections ?? []).map((s, i) =>
        i === idx ? { ...s, pairs: [...(s.pairs ?? []), { key: '', value: '' }] } : s
      ),
    }))
  }

  function removeSectionPair(idx: number, j: number) {
    setEditData(prev => ({
      ...prev,
      additionalSections: (prev.additionalSections ?? []).map((s, i) =>
        i === idx ? { ...s, pairs: (s.pairs ?? []).filter((_, k) => k !== j) } : s
      ),
    }))
  }

  function updateSectionPair(idx: number, j: number, field: 'key' | 'value', value: string) {
    setEditData(prev => ({
      ...prev,
      additionalSections: (prev.additionalSections ?? []).map((s, i) =>
        i === idx
          ? { ...s, pairs: (s.pairs ?? []).map((p, k) => k === j ? { ...p, [field]: value } : p) }
          : s
      ),
    }))
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

      // Inject a style that strips all diff highlight marks before capture
      const cleanStyle = document.createElement('style')
      cleanStyle.id = 'pdf-clean-override'
      cleanStyle.textContent = `
        #resume-content mark {
          background: none !important;
          background-color: transparent !important;
          color: inherit !important;
          border-radius: 0 !important;
          padding: 0 !important;
          -webkit-text-decoration: none !important;
          text-decoration: none !important;
        }
      `
      document.head.appendChild(cleanStyle)

      let imgData: string
      try {
        imgData = await toPng(element, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true, cacheBust: true })
      } finally {
        restores.forEach(r => r())
        document.head.removeChild(cleanStyle)
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

  async function handleSaveChanges() {
    await onSaveEdits?.(editData)
    setIsEditing(false)
    setHasLocalEdits(true)
  }

  // Auto-download: Pro users clicking the download icon trigger download on mount
  useEffect(() => {
    if (autoDownload && canDownload) {
      const t = setTimeout(() => void handleDownload(), 300)
      return () => clearTimeout(t)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] dark:border-[#334155] flex-shrink-0">
          <div>
            <h2 className="font-bold text-[16px] text-[#0F172A] dark:text-[#F1F5F9]">
              {isEditing ? editHeading : heading}
            </h2>
            <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {isEditing ? editSubtitle : subtitle}
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
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500">Professional Summary</p>
                  <div className="flex items-center gap-1.5">
                    <AIBtn label="Improve" loading={!!aiLoading['summary_improve']}   onClick={() => handleAISummary('improve')}   />
                    <AIBtn label="Shorter" loading={!!aiLoading['summary_shorten']}   onClick={() => handleAISummary('shorten')}   />
                    <AIBtn label="Stronger" loading={!!aiLoading['summary_strengthen']} onClick={() => handleAISummary('strengthen')} />
                  </div>
                </div>
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
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Work Experience</p>
                  <div className="space-y-4">
                    {editData.experience.map((exp, i) => (
                      <div key={i} className="bg-[#F8FAFC] dark:bg-[#0F172A]/60 rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-4">
                        {/* Job title + company + dates — all editable */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div>
                            <label className="block text-[10px] font-medium text-gray-400 dark:text-slate-500 mb-1">Job Title</label>
                            <input
                              type="text"
                              value={exp.title ?? ''}
                              onChange={e => updateExpField(i, 'title', e.target.value)}
                              placeholder="Job Title"
                              className="w-full px-3 py-1.5 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-400 dark:text-slate-500 mb-1">Company</label>
                            <input
                              type="text"
                              value={exp.company ?? ''}
                              onChange={e => updateExpField(i, 'company', e.target.value)}
                              placeholder="Company Name"
                              className="w-full px-3 py-1.5 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-400 dark:text-slate-500 mb-1">Start Date</label>
                            <input
                              type="text"
                              value={exp.start_date ?? ''}
                              onChange={e => updateExpField(i, 'start_date', e.target.value)}
                              placeholder="Jan 2020"
                              className="w-full px-3 py-1.5 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-400 dark:text-slate-500 mb-1">End Date</label>
                            <input
                              type="text"
                              value={exp.end_date ?? ''}
                              onChange={e => updateExpField(i, 'end_date', e.target.value)}
                              placeholder="Present"
                              className="w-full px-3 py-1.5 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                            />
                          </div>
                        </div>
                        {/* Bullet points */}
                        <div className="space-y-2">
                          {(exp.bullets ?? []).map((bullet, j) => (
                            <div key={j} className="flex flex-col gap-1">
                              <div className="flex gap-2">
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
                              <div className="flex items-center gap-1.5 pl-0.5">
                                <AIBtn label="Improve"  loading={!!aiLoading[`exp_${i}_bullet_${j}_improve`]}   onClick={() => handleAIBullet(i, j, 'improve')}   />
                                <AIBtn label="Shorter"  loading={!!aiLoading[`exp_${i}_bullet_${j}_shorten`]}   onClick={() => handleAIBullet(i, j, 'shorten')}   />
                                <AIBtn label="Stronger" loading={!!aiLoading[`exp_${i}_bullet_${j}_strengthen`]} onClick={() => handleAIBullet(i, j, 'strengthen')} />
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center gap-3 mt-1">
                            <button
                              onClick={() => addBullet(i)}
                              className="flex items-center gap-1.5 text-[12px] text-[#2563EB] hover:text-blue-700 font-medium"
                            >
                              <Plus className="w-3.5 h-3.5" />Add bullet
                            </button>
                            <button
                              onClick={() => handleAIAddBullet(i)}
                              disabled={!!aiLoading[`exp_${i}_add`]}
                              className="flex items-center gap-1 text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {aiLoading[`exp_${i}_add`]
                                ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                : <Wand2 className="w-2.5 h-2.5" />
                              }
                              Add with AI
                            </button>
                          </div>
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

              {(editData.education?.length ?? 0) > 0 && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Education</p>
                  <div className="space-y-3">
                    {editData.education.map((edu, i) => (
                      <div key={i} className="bg-[#F8FAFC] dark:bg-[#0F172A]/60 rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-4">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-medium text-gray-400 dark:text-slate-500 mb-1">Degree</label>
                            <input
                              type="text"
                              value={edu.degree ?? ''}
                              onChange={e => updateEduField(i, 'degree', e.target.value)}
                              placeholder="e.g. Bachelor of Science"
                              className="w-full px-3 py-1.5 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-400 dark:text-slate-500 mb-1">Field of Study</label>
                            <input
                              type="text"
                              value={edu.field ?? ''}
                              onChange={e => updateEduField(i, 'field', e.target.value)}
                              placeholder="e.g. Computer Science"
                              className="w-full px-3 py-1.5 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-400 dark:text-slate-500 mb-1">School / University</label>
                            <input
                              type="text"
                              value={edu.school ?? ''}
                              onChange={e => updateEduField(i, 'school', e.target.value)}
                              placeholder="e.g. MIT"
                              className="w-full px-3 py-1.5 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-400 dark:text-slate-500 mb-1">Graduation Year</label>
                            <input
                              type="text"
                              value={edu.graduation_year ?? ''}
                              onChange={e => updateEduField(i, 'graduation_year', e.target.value)}
                              placeholder="e.g. 2020"
                              className="w-full px-3 py-1.5 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

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

              {/* ── Custom / Additional Sections ──────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500">Additional Sections</p>
                  <span className="text-[10px] text-gray-300 dark:text-slate-600 italic">Languages, Awards, Hobbies, etc.</span>
                </div>

                {(editData.additionalSections?.length ?? 0) > 0 && (
                  <div className="space-y-3 mb-3">
                    {(editData.additionalSections ?? []).map((section, idx) => {
                      const effectiveType = section.type ?? 'text'
                      const totalSecs = (editData.additionalSections ?? []).length
                      return (
                        <div key={idx} className="bg-[#F8FAFC] dark:bg-[#0F172A]/60 rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-4">

                          {/* Title row + reorder + delete */}
                          <div className="flex items-center gap-2 mb-3">
                            <input
                              type="text"
                              value={section.title}
                              onChange={e => updateCustomSection(idx, { title: e.target.value })}
                              placeholder="Section title (e.g. Languages Known)"
                              className="flex-1 px-3 py-1.5 text-[12px] font-semibold border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                            />
                            <button
                              onClick={() => moveCustomSection(idx, -1)}
                              disabled={idx === 0}
                              title="Move up"
                              className="w-6 h-6 rounded flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 disabled:opacity-30 transition-colors"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveCustomSection(idx, 1)}
                              disabled={idx === totalSecs - 1}
                              title="Move down"
                              className="w-6 h-6 rounded flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 disabled:opacity-30 transition-colors"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeCustomSection(idx)}
                              title="Delete section"
                              className="w-6 h-6 rounded flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Type selector */}
                          <div className="flex items-center gap-1.5 mb-3">
                            <span className="text-[10px] text-gray-400 dark:text-slate-500 mr-1">Type:</span>
                            {([
                              { val: 'text',     icon: AlignLeft, label: 'Text'      },
                              { val: 'bullets',  icon: List,      label: 'Bullets'   },
                              { val: 'keyvalue', icon: Table2,    label: 'Key-Value' },
                            ] as const).map(({ val, icon: Icon, label }) => (
                              <button
                                key={val}
                                onClick={() => updateCustomSection(idx, { type: val })}
                                className={[
                                  'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-colors',
                                  effectiveType === val
                                    ? 'border-[#2563EB] bg-blue-50 dark:bg-[#1E3A5F] text-[#2563EB]'
                                    : 'border-[#E5E7EB] dark:border-[#334155] text-gray-400 dark:text-slate-500 hover:border-[#2563EB]/40 hover:text-[#2563EB]',
                                ].join(' ')}
                              >
                                <Icon className="w-2.5 h-2.5" />{label}
                              </button>
                            ))}
                          </div>

                          {/* Content editor by type */}
                          {effectiveType === 'text' && (
                            <textarea
                              rows={3}
                              value={section.content}
                              onChange={e => updateCustomSection(idx, { content: e.target.value })}
                              placeholder="Write the section content here…"
                              className="w-full px-3 py-2 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none"
                            />
                          )}

                          {effectiveType === 'bullets' && (
                            <div className="space-y-2">
                              {(section.items ?? []).map((item, j) => (
                                <div key={j} className="flex gap-2 items-center">
                                  <span className="text-[#2563EB] text-[11px] flex-shrink-0">•</span>
                                  <input
                                    type="text"
                                    value={item}
                                    onChange={e => updateSectionItem(idx, j, e.target.value)}
                                    placeholder="Add item…"
                                    className="flex-1 px-3 py-1.5 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                                  />
                                  <button
                                    onClick={() => removeSectionItem(idx, j)}
                                    className="w-6 h-6 flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-red-400 rounded transition-colors flex-shrink-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => addSectionItem(idx)}
                                className="flex items-center gap-1.5 text-[12px] text-[#2563EB] hover:text-blue-700 font-medium mt-1"
                              >
                                <Plus className="w-3.5 h-3.5" />Add item
                              </button>
                            </div>
                          )}

                          {effectiveType === 'keyvalue' && (
                            <div className="space-y-2">
                              {(section.pairs ?? []).map((pair, j) => (
                                <div key={j} className="flex gap-2 items-center">
                                  <input
                                    type="text"
                                    value={pair.key}
                                    onChange={e => updateSectionPair(idx, j, 'key', e.target.value)}
                                    placeholder="Label"
                                    className="w-[35%] px-3 py-1.5 text-[12px] font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                                  />
                                  <span className="text-gray-300 dark:text-slate-600 text-[11px] flex-shrink-0">:</span>
                                  <input
                                    type="text"
                                    value={pair.value}
                                    onChange={e => updateSectionPair(idx, j, 'value', e.target.value)}
                                    placeholder="Value"
                                    className="flex-1 px-3 py-1.5 text-[12px] border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                                  />
                                  <button
                                    onClick={() => removeSectionPair(idx, j)}
                                    className="w-6 h-6 flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-red-400 rounded transition-colors flex-shrink-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => addSectionPair(idx)}
                                className="flex items-center gap-1.5 text-[12px] text-[#2563EB] hover:text-blue-700 font-medium mt-1"
                              >
                                <Plus className="w-3.5 h-3.5" />Add field
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <button
                  onClick={addCustomSection}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-dashed border-[#E5E7EB] dark:border-[#334155] text-[12px] font-semibold text-gray-400 dark:text-slate-500 hover:border-[#2563EB]/50 hover:text-[#2563EB] hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all w-full justify-center"
                >
                  <Plus className="w-3.5 h-3.5" />Add Section
                </button>
              </section>

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
                      <SectionContentPreview section={section} />
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
                onClick={() => { if (mode === 'create') { onClose() } else { setIsEditing(false) } }}
                className="px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
              >
                Cancel
              </button>

              {mode === 'create' ? (
                <button
                  onClick={handleSaveAndFindJobs}
                  disabled={isSavingJobs}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-[13px] font-bold hover:from-violet-700 hover:to-blue-700 transition-all shadow-sm hover:scale-[1.02] active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {isSavingJobs
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                    : <><BriefcaseBusiness className="w-3.5 h-3.5" />Save Resume &amp; Find Jobs</>
                  }
                </button>
              ) : (
                <button
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSaving
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                    : <><Check className="w-3.5 h-3.5" />Save Changes</>
                  }
                </button>
              )}
            </>
          ) : isOptimizedPreview && viewMode && !hasLocalEdits ? (
            /* ── Case 2: Opened from "View Optimized Resume" — no pending save ── */
            /* Left: Close   Right: Edit PDF | Download PDF */
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={enterEdit}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />Edit PDF
                </button>
                <button
                  onClick={canDownload ? handleDownload : onLockedDownload}
                  disabled={canDownload && isDownloading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {canDownload && isDownloading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Download className="w-3.5 h-3.5" />
                  }
                  Download PDF
                </button>
              </div>
            </>
          ) : isOptimizedPreview ? (
            /* ── Case 1 / Case 2-after-edit: Edit PDF | Download PDF | Save ── */
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={enterEdit}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />Edit PDF
              </button>

              <button
                onClick={canDownload ? handleDownload : onLockedDownload}
                disabled={canDownload && isDownloading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {canDownload && isDownloading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />
                }
                Download PDF
              </button>

              {/* Save — closes modal; triggers celebration in Case 1, plain close in Case 2-after-edit */}
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-100 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />Save
              </button>
            </div>
          ) : (
            /* ── Default preview footer (general improvement, resume builder) ── */
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors">
                Close
              </button>
              <div className="flex items-center gap-2">
                {!isFreePreview && (
                  <button
                    onClick={enterEdit}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />Edit Manually
                  </button>
                )}
                {canDownload ? (
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Download PDF
                  </button>
                ) : onLockedDownload ? (
                  <button
                    onClick={onLockedDownload}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />Download PDF
                  </button>
                ) : (
                  <button
                    disabled
                    title="Save this resume to download the version most likely to get interviews"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-300 dark:text-slate-600 cursor-not-allowed"
                  >
                    <Lock className="w-3.5 h-3.5" />Download PDF
                  </button>
                )}
                {isFreePreview && onUnlock ? (
                  <button
                    onClick={onUnlock}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-[13px] font-bold hover:from-violet-700 hover:to-blue-700 transition-all hover:scale-[1.02] active:scale-100 shadow-sm"
                  >
                    <Crown className="w-3.5 h-3.5" />Save &amp; download this resume
                  </button>
                ) : onApprove ? (
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
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
