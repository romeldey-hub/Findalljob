'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Search, ChevronDown, HelpCircle, Mail, MessageSquare } from 'lucide-react'

// ── Data ──────────────────────────────────────────────────────────────────────

interface HelpItem {
  question: string
  answer: string
}

interface HelpSection {
  title: string
  items: HelpItem[]
}

const HELP_DATA: HelpSection[] = [
  {
    title: 'Getting Started',
    items: [
      {
        question: 'How do I start using the platform?',
        answer: 'Upload your resume on the "My Resume" page, then head to "Job Matches" to explore AI-ranked results. Once you find a role you like, use the Optimizer to tailor your resume and hit Apply.',
      },
      {
        question: 'Where do I upload my resume?',
        answer: 'Go to the "My Resume" page from the left sidebar. You can upload a PDF — the system will automatically parse and store your details for AI matching.',
      },
    ],
  },
  {
    title: 'AI Job Matching',
    items: [
      {
        question: 'How does AI job matching work?',
        answer: 'We analyze your resume and compare it against each job description using Claude AI. Every job gets a score from 0 to 100 — the higher the score, the better your resume fits the role.',
      },
      {
        question: 'What is a good match score?',
        answer: '70 or above is a strong match and worth applying to immediately. Scores between 40 and 70 are moderate matches — optimizing your resume can push these higher. Below 40 suggests a low fit and is generally not worth pursuing.',
      },
      {
        question: 'Why do scores change after I upload a new resume?',
        answer: 'Scores are always computed against your active resume. When you upload and analyze a new resume, all previous scores are cleared and every job is re-evaluated from scratch with the latest data.',
      },
    ],
  },
  {
    title: 'Resume Optimization',
    items: [
      {
        question: 'What happens when I optimize my resume?',
        answer: 'The AI rewrites your resume to better match the selected job — adding relevant keywords, strengthening bullet points, and aligning your experience with what the employer is looking for. The original is preserved so you can compare.',
      },
      {
        question: 'Why is my score different after optimization?',
        answer: 'After optimization your resume is re-scored against the job. The new score reflects how well the tailored version matches. Most users see a significant increase after optimization.',
      },
      {
        question: 'How many optimizations do I get?',
        answer: 'Free users get one preview optimization. Pro users get unlimited optimizations across all jobs.',
      },
    ],
  },
  {
    title: 'Manual Job Search',
    items: [
      {
        question: 'Why is manual search not returning results sometimes?',
        answer: 'Job sources occasionally block automated requests or return empty results for very specific queries. Try broader keywords (e.g. "Sales Manager" instead of "MEP Sales Head India"), a different location, or switch to AI search using your resume.',
      },
      {
        question: 'Can I paste job links?',
        answer: 'Yes. Click "Paste Job Description" and drop in a URL or paste the full job description text. The system will fetch the page, extract details automatically, and score your fit. If a site blocks fetching, paste the full description text directly instead.',
      },
    ],
  },
  {
    title: 'Job Tracker',
    items: [
      {
        question: 'How does job tracking work?',
        answer: 'The Tracker page is your personal job pipeline. Save any job from the matches page to add it to your tracker. You can then update its status — Saved, Applied, Interview, Offer, or Rejected — and keep notes on each application.',
      },
      {
        question: 'How do I save a job?',
        answer: 'Click the bookmark icon on any job card to save it to your tracker. Alternatively, clicking "Apply Now" will open the application page and automatically save the job to your tracker.',
      },
    ],
  },
  {
    title: 'Account & Settings',
    items: [
      {
        question: 'How do I change my password?',
        answer: 'Go to Settings from the left sidebar and find the "Change Password" section. You\'ll receive a password reset email at your registered address.',
      },
      {
        question: 'Can I delete my account?',
        answer: 'Yes. Go to Settings and scroll to the "Danger Zone" section. Account deletion is permanent and removes all your data including resume, matches, and applications.',
      },
    ],
  },
  {
    title: 'AI Features & Access',
    items: [
      {
        question: 'Why can\'t I use AI features?',
        answer: 'Full AI features — unlimited optimizations, AI cover letters, and priority matching — are part of the Pro plan. Free users get one preview optimization to try before upgrading.',
      },
      {
        question: 'How do I upgrade to Pro?',
        answer: 'Click "Upgrade Now" at the bottom of the left sidebar, or go to Settings and find the Billing section. Pro unlocks all AI features instantly.',
      },
    ],
  },
  {
    title: 'Troubleshooting',
    items: [
      {
        question: 'Why am I seeing no job results?',
        answer: 'Try using broader keywords — generic titles like "Software Engineer" or "Marketing Manager" return more results than niche queries. Also check that you\'ve entered a valid location. If the issue persists, try the AI search which uses your resume to find relevant jobs automatically.',
      },
      {
        question: 'Why does resume analysis take so long?',
        answer: 'Analysis involves parsing your resume, fetching live job listings, and running AI scoring across 25+ jobs simultaneously. This typically takes 30–60 seconds. If it times out, try again — job sources occasionally have delays.',
      },
      {
        question: 'My resume was uploaded but not parsed correctly. What do I do?',
        answer: 'Make sure your PDF contains selectable text (not a scanned image). If parsing is still wrong, try re-uploading. If problems persist, contact support with your resume attached and we\'ll fix it manually.',
      },
    ],
  },
]

// ── Accordion item ─────────────────────────────────────────────────────────────

function AccordionItem({
  item,
  isOpen,
  onToggle,
  highlight,
}: {
  item: HelpItem
  isOpen: boolean
  onToggle: () => void
  highlight: string
}) {
  function highlightText(text: string, query: string) {
    if (!query.trim()) return text
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 rounded-[2px] px-px">{part}</mark>
        : part
    )
  }

  return (
    <div className="border border-[#E5E7EB] dark:border-[#334155] rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]/60 transition-colors"
      >
        <span className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] leading-snug">
          {highlightText(item.question, highlight)}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {/* Grid trick for smooth height animation with no JS measurement */}
      <div className={`grid transition-all duration-200 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <p className="px-4 pb-4 pt-0.5 text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
            {highlightText(item.answer, highlight)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────────

interface HelpModalProps {
  onClose: () => void
}

export function HelpModal({ onClose }: HelpModalProps) {
  const [search, setSearch]     = useState('')
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())
  const inputRef                = useRef<HTMLInputElement>(null)
  const scrollRef               = useRef<HTMLDivElement>(null)

  // Focus search on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const query = search.toLowerCase().trim()

  // Filter sections + items by search query
  const filteredSections = useMemo(() => {
    if (!query) return HELP_DATA
    return HELP_DATA
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.question.toLowerCase().includes(query) ||
            item.answer.toLowerCase().includes(query)
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [query])

  // Auto-open all matches when searching; close all when cleared
  useEffect(() => {
    if (!query) { setOpenKeys(new Set()); return }
    const keys = new Set<string>()
    filteredSections.forEach((section) => {
      section.items.forEach((item, i) => keys.add(`${section.title}-${i}`))
    })
    setOpenKeys(keys)
  }, [query, filteredSections])

  function toggleItem(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const totalItems = filteredSections.reduce((n, s) => n + s.items.length, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]" />

      {/* Modal */}
      <div
        className="relative w-full max-w-[800px] bg-white dark:bg-[#0F1B2D] rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 pt-6 pb-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-[#1E3A5F] flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-4.5 h-4.5 text-[#2563EB]" />
            </div>
            <div>
              <h2 className="text-[18px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
                Help &amp; Support
              </h2>
              <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
                Find answers and get the most out of Find All Job
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#1E293B] transition-colors flex-shrink-0 mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Sticky search ────────────────────────────────────────── */}
        <div className="px-6 pb-4 flex-shrink-0 border-b border-[#F1F5F9] dark:border-[#1E293B]">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-300 dark:text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search help (e.g., optimize resume, apply jobs)"
              className="w-full pl-10 pr-4 py-2.5 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-xl bg-[#F8FAFC] dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-gray-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] dark:focus:border-[#2563EB] transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {query && (
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-2 pl-1">
              {totalItems === 0 ? 'No results' : `${totalItems} result${totalItems !== 1 ? 's' : ''} for "${search}"`}
            </p>
          )}
        </div>

        {/* ── Scrollable content ────────────────────────────────────── */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 px-6 py-5 space-y-7">

          {/* Empty state */}
          {filteredSections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#F8FAFC] dark:bg-[#1E293B] flex items-center justify-center mb-3">
                <Search className="w-5 h-5 text-gray-200 dark:text-slate-700" />
              </div>
              <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">No results found</p>
              <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1">Try different keywords</p>
            </div>
          )}

          {/* Sections */}
          {filteredSections.map((section) => (
            <div key={section.title}>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3 pl-1">
                {section.title}
              </p>
              <div className="space-y-2">
                {section.items.map((item, i) => {
                  const key = `${section.title}-${i}`
                  return (
                    <AccordionItem
                      key={key}
                      item={item}
                      isOpen={openKeys.has(key)}
                      onToggle={() => toggleItem(key)}
                      highlight={query}
                    />
                  )
                })}
              </div>
            </div>
          ))}

          {/* Footer */}
          <div className="border-t border-[#F1F5F9] dark:border-[#1E293B] pt-5 pb-1">
            <p className="text-[12px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] mb-3">Still need help?</p>
            <div className="flex items-center flex-wrap gap-3">
              <a
                href="mailto:support@findalljob.com"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-medium text-gray-600 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                support@findalljob.com
              </a>
              <a
                href="mailto:support@findalljob.com?subject=Issue Report"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[12px] font-semibold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Report an issue
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
