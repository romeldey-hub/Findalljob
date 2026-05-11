'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, CheckCircle2, BriefcaseBusiness, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { AIResumeBuilder } from './AIResumeBuilder'
import { ResumePreviewModal } from './ResumePreviewModal'
import { CountryConfirmStep, type CountryChoice } from './CountryConfirmStep'
import { UpgradeModal } from '@/components/UpgradeModal'
import type { QAAnswers } from './AIResumeBuilder'
import type { ParsedResume } from '@/types'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

type Phase = 'idle' | 'no_credits' | 'qa' | 'generating' | 'editing' | 'saving' | 'analyzing' | 'country_confirm' | 'done'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const RESUME_GENERATE_COST = 2

function toOptimized(pd: ParsedResume): OptimizedResumeData {
  return {
    name:     pd.name     ?? '',
    email:    pd.email    ?? '',
    phone:    pd.phone    ?? '',
    location: pd.location ?? '',
    linkedin: pd.linkedin ?? '',
    summary:  pd.summary  ?? '',
    experience: (pd.experience ?? []).map(e => ({
      title:      e.title,
      company:    e.company,
      location:   '',
      start_date: e.start_date,
      end_date:   e.end_date ?? '',
      bullets:    e.bullets ?? [],
    })),
    skills:             pd.skills         ?? [],
    education:          pd.education      ?? [],
    certifications:     pd.certifications ?? [],
    additionalSections: (pd.sections ?? []).map(s => ({ title: s.title, content: s.content })),
    ats_score:               0,
    original_score:          undefined,
    section_scores:          { summary: 0, skills: 0, experience: 0 },
    matched_keywords:        [],
    missing_keywords:        [],
    improvements:            [],
    score_improvements:      { keyword_increase: 0, skill_match_increase: 0, experience_alignment_increase: 0, missing_skills_reduction: 0 },
    score_improvement_reason: '',
  }
}

function toParsed(opt: OptimizedResumeData): ParsedResume {
  return {
    name:     opt.name,
    email:    opt.email,
    phone:    opt.phone,
    location: opt.location,
    linkedin: opt.linkedin || undefined,
    summary:  opt.summary,
    experience: opt.experience.map(e => ({
      title:      e.title,
      company:    e.company,
      start_date: e.start_date,
      end_date:   e.end_date || null,
      bullets:    e.bullets,
    })),
    skills:         opt.skills,
    education:      opt.education,
    certifications: opt.certifications,
    sections:       opt.additionalSections?.map(s => ({
      title:   s.title,
      content: s.content,
      type:    s.type,
      items:   s.items,
      pairs:   s.pairs,
    })),
  }
}

const ANALYZE_STEPS = [
  'Saving your resume…',
  'Understanding your profile…',
  'Building search strategy…',
  'Searching job sources…',
  'Scoring your matches…',
  'Preparing results…',
]

const SSE_STEP_MAP: Record<string, number> = {
  resume_loaded:    1,
  profile_parsed:   1,
  strategy_ready:   2,
  jobs_fetching:    3,
  pool_selected:    3,
  ai_ranking:       4,
  matches_saved:    5,
}

export function CreateResumeWithAI({ avatarUrl }: { avatarUrl?: string | null }) {
  const [phase,                  setPhase]                  = useState<Phase>('idle')
  const [generatedPD,            setGeneratedPD]            = useState<ParsedResume | null>(null)
  const [analyzeStep,            setAnalyzeStep]            = useState(0)
  const [matchCount,             setMatchCount]             = useState(0)
  const [showUpgrade,            setShowUpgrade]            = useState(false)
  const [countryConfirmPending,  setCountryConfirmPending]  = useState<{
    detectedCountry: string | null
    detectedCountryCode: string | null
  } | null>(null)
  const router = useRouter()

  const { data: profileData } = useSWR('/api/profile', fetcher, { refreshInterval: 120000 })
  const creditsRemaining: number | null = profileData?.credits_remaining ?? null

  function handleCreateClick() {
    if (creditsRemaining !== null && creditsRemaining < RESUME_GENERATE_COST) {
      setPhase('no_credits')
      return
    }
    setPhase('qa')
  }

  // ── Q&A complete → call generate API ──────────────────────────────────────
  async function handleQAComplete(answers: QAAnswers) {
    setPhase('generating')
    try {
      const res = await fetch('/api/resume/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate resume')

      setGeneratedPD(data.parsed_data)
      setPhase('editing')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate resume. Please try again.')
      setPhase('qa')
    }
  }

  // ── Save from modal → create record + analyze ──────────────────────────────
  async function handleSaveAndFindJobs(edited: OptimizedResumeData) {
    const parsed = toParsed(edited)
    setPhase('saving')

    // Step 1: create resume record
    try {
      const res = await fetch('/api/resume/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ parsed_data: parsed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save resume')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save resume. Please try again.')
      setPhase('editing')
      return
    }

    // Step 2: parse resume only — get country confirmation before job search
    setPhase('analyzing')
    setAnalyzeStep(0)

    const parseController = new AbortController()
    const parseTimer = setTimeout(() => parseController.abort(), 5 * 60 * 1000)

    try {
      const parseRes = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'parse_resume' }),
        signal: parseController.signal,
      })

      if (!parseRes.ok) {
        toast.warning('Analysis had an issue. Your resume is saved — try finding jobs from the Matches page.')
        setPhase('done')
        setTimeout(() => router.push('/matches'), 1500)
        return
      }

      const parseData = await parseRes.json().catch(() => ({})) as Record<string, unknown>
      if (parseData.status !== 'country_confirmation_required') {
        toast.warning('Resume saved! Head to Matches to search for jobs.')
        setPhase('done')
        setTimeout(() => router.push('/matches'), 1500)
        return
      }

      setCountryConfirmPending({
        detectedCountry:     (parseData.detectedCountry     as string | null) ?? null,
        detectedCountryCode: (parseData.detectedCountryCode as string | null) ?? null,
      })
      setPhase('country_confirm')
    } catch {
      toast.warning('Resume saved! Head to Matches to search for jobs.')
      setPhase('done')
      setTimeout(() => router.push('/matches'), 1500)
    } finally {
      clearTimeout(parseTimer)
    }
  }

  // Step 3: job search after user confirms country
  async function handleCountryConfirmed(choice: CountryChoice) {
    setCountryConfirmPending(null)
    setPhase('analyzing')
    setAnalyzeStep(0)

    const abortController = new AbortController()
    const abortTimer = setTimeout(() => abortController.abort(), 10 * 60 * 1000)

    let analyzeFailed = false
    let count         = 0

    try {
      const analyzeRes = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedSearchCountry: choice.selectedSearchCountry,
          searchMode:            choice.searchMode,
          wasDetected:           choice.wasDetected,
        }),
        signal: abortController.signal,
      })

      if (!analyzeRes.ok) {
        analyzeFailed = true
        toast.warning('Analysis had an issue. Your resume is saved — try finding jobs from the Matches page.')
      } else if (analyzeRes.body) {
        const reader  = analyzeRes.body.getReader()
        const decoder = new TextDecoder()
        let   buffer  = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split('\n\n')
            buffer = parts.pop() ?? ''

            for (const part of parts) {
              for (const line of part.split('\n')) {
                if (!line.startsWith('data: ')) continue
                try {
                  const event = JSON.parse(line.slice(6)) as Record<string, unknown>
                  const stepKey = event.step as string | undefined
                  if (stepKey && SSE_STEP_MAP[stepKey] !== undefined) {
                    setAnalyzeStep(SSE_STEP_MAP[stepKey])
                  }
                  if (event.done) {
                    count = (event.matchCount as number) ?? 0
                    setAnalyzeStep(ANALYZE_STEPS.length - 1)
                  }
                  if (event.error) {
                    analyzeFailed = true
                  }
                } catch { /* malformed SSE */ }
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      }
    } catch (err) {
      analyzeFailed = true
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[CreateResumeWithAI] analyze error:', err.message)
      }
    } finally {
      clearTimeout(abortTimer)
    }

    if (!analyzeFailed) {
      setMatchCount(count)
      toast.success(count > 0 ? `Found ${count} job matches!` : 'Resume saved! Redirecting…')
    } else {
      toast.warning('Resume saved! Head to Matches to search for jobs.')
    }

    setPhase('done')
    setTimeout(() => router.push('/matches'), 1500)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* CTA button (idle) */}
      {phase === 'idle' && (
        <button
          onClick={handleCreateClick}
          className="mt-5 flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-[13px] font-bold hover:from-violet-700 hover:to-blue-700 transition-all shadow-sm hover:scale-[1.02] active:scale-100"
        >
          <Sparkles className="w-4 h-4" />
          Create Resume with AI
        </button>
      )}

      {/* Insufficient credits block */}
      {phase === 'no_credits' && (
        <div className="mt-5 flex flex-col items-center gap-3 px-5 py-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-center max-w-sm">
          <div className="flex flex-col items-center gap-1">
            <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
            <p className="font-bold text-[13px] text-red-700 dark:text-red-400">Not enough AI credits</p>
            <p className="text-[12px] text-red-600/80 dark:text-red-400/70 leading-snug">
              You need {RESUME_GENERATE_COST} AI credits to create a resume.
              You currently have {creditsRemaining ?? 0} credit{creditsRemaining === 1 ? '' : 's'} left.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUpgrade(true)}
              className="px-4 py-1.5 rounded-lg bg-[#2563EB] text-white text-[12px] font-bold hover:bg-blue-700 transition-colors"
            >
              Upgrade Plan
            </button>
            <button
              onClick={() => setPhase('idle')}
              className="px-3 py-1.5 rounded-lg text-[12px] text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Q&A builder modal */}
      {phase === 'qa' && (
        <AIResumeBuilder
          onComplete={handleQAComplete}
          onClose={() => setPhase('idle')}
        />
      )}

      {/* Generating overlay */}
      {phase === 'generating' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-4 max-w-sm w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-[#2563EB] animate-spin" />
            </div>
            <div>
              <p className="font-bold text-[16px] text-[#0F172A] dark:text-[#F1F5F9]">Building your resume…</p>
              <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1">AI is crafting your profile. Just a moment.</p>
            </div>
          </div>
        </div>
      )}

      {/* Resume edit modal (create mode) */}
      {phase === 'editing' && generatedPD && (
        <ResumePreviewModal
          data={toOptimized(generatedPD)}
          onClose={() => setPhase('idle')}
          avatarUrl={avatarUrl}
          onSaveAndFindJobs={handleSaveAndFindJobs}
          mode="create"
          heading="Create Resume"
          startInEditMode
        />
      )}

      {/* Saving overlay */}
      {phase === 'saving' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-4 max-w-sm w-full text-center">
            <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin" />
            <p className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Saving your resume…</p>
          </div>
        </div>
      )}

      {/* Analyzing overlay with live step display */}
      {phase === 'analyzing' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-5 max-w-sm w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
              <BriefcaseBusiness className="w-7 h-7 text-[#2563EB]" />
            </div>
            <div>
              <p className="font-bold text-[16px] text-[#0F172A] dark:text-[#F1F5F9]">Finding your dream jobs…</p>
              <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-1">This takes 3–5 minutes. Sit tight!</p>
            </div>
            <div className="w-full space-y-2.5 text-left">
              {ANALYZE_STEPS.map((label, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={[
                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                    i < analyzeStep  ? 'bg-green-100 dark:bg-green-900/40' :
                    i === analyzeStep ? 'bg-[#2563EB]/10' :
                                        'bg-[#F1F5F9] dark:bg-[#334155]',
                  ].join(' ')}>
                    {i < analyzeStep ? (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    ) : i === analyzeStep ? (
                      <Loader2 className="w-3 h-3 text-[#2563EB] animate-spin" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-slate-600" />
                    )}
                  </div>
                  <span className={[
                    'text-[12px]',
                    i < analyzeStep  ? 'text-green-600 dark:text-green-400 line-through' :
                    i === analyzeStep ? 'text-[#0F172A] dark:text-[#F1F5F9] font-medium' :
                                        'text-gray-300 dark:text-slate-600',
                  ].join(' ')}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Country confirmation overlay — pause before job search */}
      {phase === 'country_confirm' && countryConfirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm">
            <CountryConfirmStep
              detectedCountryCode={countryConfirmPending.detectedCountryCode}
              detectedCountryName={countryConfirmPending.detectedCountry}
              savedPreferredCode={null}
              onConfirm={handleCountryConfirmed}
            />
          </div>
        </div>
      )}

      {/* Done overlay */}
      {phase === 'done' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-4 max-w-sm w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-green-500" />
            </div>
            <div>
              <p className="font-bold text-[16px] text-[#0F172A] dark:text-[#F1F5F9]">
                {matchCount > 0 ? `Found ${matchCount} job matches!` : 'Resume saved!'}
              </p>
              <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1">Redirecting to your matches…</p>
            </div>
          </div>
        </div>
      )}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </>
  )
}
