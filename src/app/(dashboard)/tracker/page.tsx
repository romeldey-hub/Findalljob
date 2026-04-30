'use client'

import { useState, useRef, useEffect } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { toast } from 'sonner'
import {
  Building2, MapPin, Calendar, ExternalLink,
  MoreHorizontal, Trash2, Wand2, X, ArrowRight,
  MessageSquare, Copy, Check, Loader2, ChevronDown,
} from 'lucide-react'
import type { Application, ApplicationStatus } from '@/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

// ── Column config ─────────────────────────────────────────────────────────────

interface ColumnConfig {
  status: ApplicationStatus
  label: string
  dot: string
  countClass: string
}

const COLUMNS: ColumnConfig[] = [
  {
    status: 'saved',
    label: 'Saved',
    dot: 'bg-slate-400',
    countClass: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  },
  {
    status: 'applied',
    label: 'Applied',
    dot: 'bg-[#2563EB]',
    countClass: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  },
  {
    status: 'interview',
    label: 'Interview',
    dot: 'bg-amber-500',
    countClass: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  },
  {
    status: 'offer',
    label: 'Offer',
    dot: 'bg-green-500',
    countClass: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  },
]

const NEXT_STATUS: Partial<Record<ApplicationStatus, ApplicationStatus>> = {
  saved:     'applied',
  applied:   'interview',
  interview: 'offer',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getTimestampLabel(app: Application): string {
  switch (app.status) {
    case 'saved':     return `Saved on ${fmtDate(app.created_at)}`
    case 'applied':   return `Applied on ${fmtDate(app.applied_at ?? app.updated_at)}`
    case 'interview': return `Interview scheduled: ${fmtDate(app.updated_at)}`
    case 'offer':     return `Offer received: ${fmtDate(app.updated_at)}`
    default:          return ''
  }
}

// ── TrackerCard ───────────────────────────────────────────────────────────────

function TrackerCard({
  app,
  onDelete,
  onStatusChange,
  onViewDetail,
}: {
  app: Application
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: ApplicationStatus) => void
  onViewDetail: (app: Application) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const tsLabel = getTimestampLabel(app)
  const nextStatus = NEXT_STATUS[app.status]
  const nextLabel  = nextStatus ? COLUMNS.find(c => c.status === nextStatus)?.label : null

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  return (
    <div
      className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-4 shadow-sm hover:shadow-md transition-shadow duration-150 cursor-pointer"
      onClick={() => onViewDetail(app)}
    >

      {/* Top row: title + icons */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9] leading-snug line-clamp-2">
            {app.job.title}
          </h3>
          <p className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 truncate">
            <Building2 className="w-3 h-3 flex-shrink-0" />{app.job.company}
          </p>
        </div>

        {/* 3-dot menu */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-20 bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-lg py-1 w-44">
                {nextStatus && nextLabel && (
                  <button
                    onClick={() => { setMenuOpen(false); onStatusChange(app.id, nextStatus) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-gray-700 dark:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-[#334155] transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                    Move to {nextLabel}
                  </button>
                )}
                {nextStatus && <div className="my-1 border-t border-[#F1F5F9] dark:border-[#334155]" />}
                <button
                  onClick={() => { setMenuOpen(false); onDelete(app.id) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Location */}
      {app.job.location && (
        <p className="flex items-center gap-1.5 text-[12px] text-gray-400 dark:text-slate-500 mb-1.5 truncate">
          <MapPin className="w-3 h-3 flex-shrink-0" />{app.job.location}
        </p>
      )}

      {/* Timestamp */}
      {tsLabel && (
        <p className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-slate-500 mb-3">
          <Calendar className="w-3 h-3 flex-shrink-0" />{tsLabel}
        </p>
      )}

      {/* CTA */}
      <button
        onClick={(e) => { e.stopPropagation(); app.job.url ? window.open(app.job.url, '_blank') : toast.error('No job URL') }}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-600 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 dark:hover:border-slate-500 transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        {app.status === 'saved' ? 'Apply Now' : 'View Job'}
      </button>
    </div>
  )
}

// ── TrackerColumn ─────────────────────────────────────────────────────────────

function TrackerColumn({
  column,
  apps,
  onDelete,
  onStatusChange,
  onViewDetail,
}: {
  column: ColumnConfig
  apps: Application[]
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: ApplicationStatus) => void
  onViewDetail: (app: Application) => void
}) {
  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col gap-2.5">

      {/* Column header */}
      <div className="flex items-center gap-2 px-1">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${column.dot}`} />
        <span className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">{column.label}</span>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold ${column.countClass}`}>
          {apps.length}
        </span>
      </div>

      {/* Column body */}
      <div className="bg-[#F8FAFC] dark:bg-[#0F172A]/60 rounded-2xl border border-[#E5E7EB] dark:border-[#334155] p-2.5 flex flex-col gap-2 min-h-[100px]">
        {apps.length === 0 ? (
          <p className="text-[12px] text-gray-300 dark:text-slate-600 text-center py-6">No applications yet</p>
        ) : (
          apps.map(app => (
            <TrackerCard
              key={app.id}
              app={app}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              onViewDetail={onViewDetail}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Application Detail Modal ──────────────────────────────────────────────────

const MSG_TYPES = [
  { value: 'follow_up',  label: 'Follow-up after applying' },
  { value: 'thank_you',  label: 'Post-interview thank you' },
  { value: 'networking', label: 'Networking / cold outreach' },
  { value: 'withdraw',   label: 'Withdraw application' },
]

// Which message types make sense at each stage
const STATUS_MSG_TYPES: Partial<Record<ApplicationStatus, string[]>> = {
  saved:        ['networking'],
  applied:      ['follow_up', 'networking', 'withdraw'],
  phone_screen: ['follow_up', 'withdraw'],
  interview:    ['thank_you', 'follow_up', 'withdraw'],
  offer:        ['thank_you', 'withdraw'],
  rejected:     ['networking'],
  ghosted:      ['follow_up', 'networking'],
}

function ApplicationDetailModal({ app, onClose }: { app: Application; onClose: () => void }) {
  const col     = COLUMNS.find(c => c.status === app.status)
  const tsLabel = getTimestampLabel(app)
  const initial = app.job.company?.[0]?.toUpperCase() ?? '?'

  const availableMsgTypes = MSG_TYPES.filter(t => STATUS_MSG_TYPES[app.status]?.includes(t.value))
  const [msgType, setMsgType] = useState(availableMsgTypes[0]?.value ?? 'follow_up')
  const [generating, setGenerating] = useState(false)
  const [message, setMessage]       = useState('')
  const [copied, setCopied]         = useState(false)

  async function handleGenerate() {
    setGenerating(true)
    setMessage('')
    try {
      const res = await fetch('/api/followup/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: app.id, type: msgType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setMessage(data.message)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate message')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-2xl flex flex-col max-h-[90vh]">

        {/* Scrollable content */}
        <div className="overflow-y-auto p-6 space-y-5">

          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#EFF6FF] dark:bg-[#1E3A5F] flex items-center justify-center text-[#2563EB] font-black text-base flex-shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-[16px] text-[#0F172A] dark:text-[#F1F5F9] leading-snug">{app.job.title}</h2>
              <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-0.5">{app.job.company}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Meta */}
          <div className="space-y-1.5 border-t border-[#F1F5F9] dark:border-[#334155] pt-4">
            {app.job.location && (
              <p className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-slate-400">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />{app.job.location}
              </p>
            )}
            {app.job.salary && (
              <p className="text-[13px] font-semibold text-gray-700 dark:text-slate-200">{app.job.salary}</p>
            )}
            {tsLabel && (
              <p className="flex items-center gap-2 text-[12px] text-gray-400 dark:text-slate-500">
                <Calendar className="w-3.5 h-3.5 flex-shrink-0" />{tsLabel}
              </p>
            )}
            {col && (
              <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${col.countClass}`}>
                {col.label}
              </span>
            )}
          </div>

          {/* Actions row */}
          <div className="flex gap-2">
            {app.job.url && (
              <a
                href={app.job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />View Job
              </a>
            )}
            <a
              href={`/optimizer?jobId=${app.job.id}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-colors"
            >
              <Wand2 className="w-3.5 h-3.5" />Optimize Resume
            </a>
          </div>

          {/* ── Follow-up Message Generator ─────────────────────── */}
          <div className="border-t border-[#F1F5F9] dark:border-[#334155] pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#EFF6FF] dark:bg-[#1E3A5F] flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-3.5 h-3.5 text-[#2563EB]" />
              </div>
              <p className="font-bold text-[13px] text-[#0F172A] dark:text-[#F1F5F9]">Generate Message</p>
            </div>

            {/* Type selector */}
            <div className="relative">
              <select
                value={msgType}
                onChange={(e) => setMsgType(e.target.value)}
                className="w-full text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-xl px-3 py-2.5 pr-8 appearance-none bg-white dark:bg-[#263549] text-gray-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 cursor-pointer"
              >
                {availableMsgTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#2563EB] text-[#2563EB] text-[13px] font-semibold hover:bg-[#EFF6FF] dark:hover:bg-[#1E3A5F] transition-colors disabled:opacity-50"
            >
              {generating
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                : <><MessageSquare className="w-3.5 h-3.5" />Generate Message</>}
            </button>

            {/* Generated message */}
            {message && (
              <div className="relative">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full h-44 p-3 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-xl bg-[#F8FAFC] dark:bg-[#263549] text-gray-700 dark:text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
                <button
                  onClick={handleCopy}
                  className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] text-[11px] font-semibold text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-[#263549] transition-colors shadow-sm"
                >
                  {copied ? <><Check className="w-3 h-3 text-green-500" />Copied!</> : <><Copy className="w-3 h-3" />Copy</>}
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ── TrackerPage ───────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const { data, mutate } = useSWR('/api/applications', fetcher)
  const applications: Application[] = data?.applications ?? []
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)

  async function handleStatusChange(id: string, status: ApplicationStatus) {
    try {
      const res = await fetch('/api/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error()
      await mutate()
      globalMutate('/api/applications')
      const label = COLUMNS.find(c => c.status === status)?.label ?? status
      toast.success(`Moved to ${label}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/applications?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await mutate()
      globalMutate('/api/applications')
      toast.success('Removed from tracker')
    } catch {
      toast.error('Failed to remove')
    }
  }

  const grouped = Object.fromEntries(
    COLUMNS.map(col => [col.status, applications.filter(a => a.status === col.status)])
  ) as Record<ApplicationStatus, Application[]>

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
          Application Tracker
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">
          Track every application through the hiring pipeline.
        </p>
      </div>

      {/* Kanban board */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
          {COLUMNS.map(col => (
            <TrackerColumn
              key={col.status}
              column={col}
              apps={grouped[col.status] ?? []}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              onViewDetail={setSelectedApp}
            />
          ))}
        </div>
      </div>

      {/* Detail modal */}
      {selectedApp && (
        <ApplicationDetailModal app={selectedApp} onClose={() => setSelectedApp(null)} />
      )}
    </div>
  )
}
