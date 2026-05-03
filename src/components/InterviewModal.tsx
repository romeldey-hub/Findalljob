'use client'

import { useState, useRef, useEffect, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  X, ChevronRight, Loader2, Crown,
  CheckCircle2, AlertTriangle, Mic,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'asking' | 'submitting' | 'feedback' | 'upgrade' | 'complete'

interface Scores {
  clarity: number
  relevance: number
  depth: number
  confidence: number
}

interface Feedback {
  scores: Scores
  strengths: string[]
  gaps: string[]
  redFlags: string[]
  improvedAnswer: string
}

interface JobContext {
  id: string
  title: string
  company: string
  description: string
}

interface Props {
  job: JobContext
  isPro: boolean
  onClose: () => void
  mode?: 'resume' | 'job-based'
}

const TOTAL_QUESTIONS = 5

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(v: number) {
  if (v >= 8) return 'text-green-600 dark:text-green-400'
  if (v >= 6) return 'text-blue-600 dark:text-blue-400'
  if (v >= 4) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500'
}

function scoreBarColor(v: number) {
  if (v >= 8) return 'bg-green-500'
  if (v >= 6) return 'bg-blue-500'
  if (v >= 4) return 'bg-amber-500'
  return 'bg-red-500'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#F8FAFC] dark:bg-[#0F172A] rounded-xl p-3 border border-[#E5E7EB] dark:border-[#334155]">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 capitalize">{label}</span>
        <span className={`text-[16px] font-black leading-none ${scoreColor(value)}`}>
          {value}<span className="text-[9px] font-medium text-gray-400 dark:text-slate-500">/10</span>
        </span>
      </div>
      <div className="h-1.5 bg-[#E5E7EB] dark:bg-[#334155] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${scoreBarColor(value)} transition-all duration-700`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  )
}

// Progress always shows out of TOTAL_QUESTIONS (5) for all users
function ProgressDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i < current ? 'w-6 bg-[#2563EB]' : 'w-3 bg-[#E5E7EB] dark:bg-[#334155]'
          }`}
        />
      ))}
      <span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 ml-1 tabular-nums">
        Q{current} / {TOTAL_QUESTIONS}
      </span>
    </div>
  )
}

// ── LeftPanel ─────────────────────────────────────────────────────────────────
// Defined at module scope so its identity is stable across InterviewModal re-renders.
// Putting it inside InterviewModal would create a new component type on every keystroke,
// causing React to unmount/remount the textarea and drop input focus.

interface LeftPanelProps {
  locked: boolean
  questionNumber: number
  currentQuestion: string
  answer: string
  onAnswerChange: (v: string) => void
  error: string
  phase: Phase
  onSubmit: () => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

function LeftPanel({
  locked, questionNumber, currentQuestion,
  answer, onAnswerChange, error, phase, onSubmit, textareaRef,
}: LeftPanelProps) {
  return (
    <div className={`flex-1 md:w-[60%] overflow-y-auto p-5 md:p-8 space-y-5 md:border-r border-[#E5E7EB] dark:border-[#334155] flex-shrink-0 ${locked ? 'opacity-60 pointer-events-none select-none' : ''}`}>
      {/* Question card */}
      <div className="bg-[#F8FAFC] dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] p-5 md:p-6">
        <span className="inline-block text-[10px] font-bold uppercase tracking-[0.15em] text-[#2563EB] mb-3">
          Question {questionNumber}
        </span>
        <p className="text-[16px] md:text-[17px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] leading-relaxed">
          {currentQuestion || '…'}
        </p>
      </div>

      {error && (
        <p className="text-[13px] text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5">
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <textarea
          ref={locked ? undefined : textareaRef}
          value={answer}
          onChange={e => onAnswerChange(e.target.value)}
          disabled={phase !== 'asking' || locked}
          placeholder="Type your answer here…"
          className="w-full resize-none rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#1A2540] text-[14px] text-[#0F172A] dark:text-[#F1F5F9] placeholder:text-gray-300 dark:placeholder:text-slate-600 p-4 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] disabled:cursor-default transition-all"
          style={{ minHeight: 120, maxHeight: 300 }}
        />
        {!locked && (
          <p className="text-[11px] text-gray-400 dark:text-slate-500">
            Take your time. Aim for a clear, structured answer.
          </p>
        )}
      </div>

      {(phase === 'asking' || phase === 'submitting') && !locked && (
        <button
          onClick={onSubmit}
          disabled={!answer.trim() || phase === 'submitting'}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[14px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all hover:scale-[1.01] active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 shadow-sm"
        >
          {phase === 'submitting'
            ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing your answer…</>
            : 'Submit Answer'}
        </button>
      )}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function InterviewModal({ job, isPro, onClose, mode = 'job-based' }: Props) {
  const isResumeBased = mode === 'resume'
  const [phase, setPhase]                         = useState<Phase>('loading')
  const [questionNumber, setQuestionNumber]       = useState(1)
  const [currentQuestion, setCurrentQuestion]     = useState('')
  const [answer, setAnswer]                       = useState('')
  const [feedback, setFeedback]                   = useState<Feedback | null>(null)
  const [previousQuestions, setPreviousQuestions] = useState<string[]>([])
  const [showImproved, setShowImproved]           = useState(false)
  const [confirmExit, setConfirmExit]             = useState(false)
  const [error, setError]                         = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => { startInterview() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`
  }, [answer])

  useEffect(() => {
    if (phase === 'feedback' && window.innerWidth < 768) {
      feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [phase])

  async function startInterview() {
    setPhase('loading')
    setError('')
    try {
      const res = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.title,
          company: job.company,
          jobDescription: job.description,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start interview')
      setCurrentQuestion(data.question)
      setQuestionNumber(1)
      setPreviousQuestions([])
      setAnswer('')
      setFeedback(null)
      setShowImproved(false)
      setPhase('asking')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start interview.')
      setPhase('asking')
    }
  }

  async function handleSubmit() {
    if (!answer.trim() || phase !== 'asking') return
    setPhase('submitting')
    setError('')
    try {
      const res = await fetch('/api/interview/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentQuestion,
          answer: answer.trim(),
          jobTitle: job.title,
          company: job.company,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Evaluation failed')
      setFeedback(data)
      setPreviousQuestions(prev => [...prev, currentQuestion])
      setPhase('feedback')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to evaluate. Please try again.')
      setPhase('asking')
    }
  }

  async function handleNext() {
    // Free users see the upgrade panel (keeping context visible)
    if (!isPro) { setPhase('upgrade'); return }

    const nextNum = questionNumber + 1
    if (nextNum > TOTAL_QUESTIONS) { setPhase('complete'); return }

    setPhase('loading')
    setAnswer('')
    setFeedback(null)
    setShowImproved(false)
    setError('')

    try {
      const res = await fetch('/api/interview/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionNumber: nextNum,
          previousQuestions,
          jobTitle: job.title,
          company: job.company,
          jobDescription: job.description,
        }),
      })
      const data = await res.json()
      // Backend can also enforce upgrade gate
      if (res.status === 402 || data.requiresUpgrade) { setPhase('upgrade'); return }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load next question')
      setCurrentQuestion(data.question)
      setQuestionNumber(nextNum)
      setPhase('asking')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load next question.')
      setPhase('feedback') // stay on feedback so user can retry
    }
  }

  function handleClose() {
    if (phase === 'asking' || phase === 'feedback' || phase === 'submitting' || phase === 'upgrade') {
      setConfirmExit(true)
    } else {
      onClose()
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal shell */}
      <div className="relative z-10 w-full h-full md:h-[92vh] md:max-w-6xl md:mx-4 bg-white dark:bg-[#0B1120] md:rounded-2xl md:border md:border-[#E5E7EB] dark:md:border-[#334155] md:shadow-2xl flex flex-col overflow-hidden">

        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#0B1120] flex-shrink-0">
          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#1E293B] transition-colors text-[13px] font-medium"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Exit</span>
          </button>

          <div className="text-center">
            <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-1.5 justify-center">
              <Mic className="w-3.5 h-3.5 text-[#2563EB]" />Mock Interview
            </p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate max-w-[200px] sm:max-w-xs">
              {isResumeBased ? 'Based on your resume' : `${job.title} · ${job.company}`}
            </p>
          </div>

          <div className="flex items-center">
            {phase !== 'complete' && phase !== 'loading' ? (
              <ProgressDots current={questionNumber} />
            ) : (
              <div className="w-28" />
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex min-h-0">

          {/* Loading */}
          {phase === 'loading' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-7 h-7 text-[#2563EB] animate-spin" />
                </div>
                <p className="text-[15px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                  {questionNumber === 1 ? 'Preparing your interview…' : `Loading question ${questionNumber}…`}
                </p>
                <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-1">
                  AI is tailoring questions to your profile
                </p>
              </div>
            </div>
          )}

          {/* Complete */}
          {phase === 'complete' && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-[24px] font-black text-[#0F172A] dark:text-[#F1F5F9] mb-2">Interview Complete!</h3>
                <p className="text-[14px] text-gray-500 dark:text-slate-400 leading-relaxed mb-6">
                  Great practice. Review the feedback from each question to sharpen your real-world answers.
                </p>
                <button
                  onClick={onClose}
                  className="px-8 py-3 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[14px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-100"
                >
                  {isResumeBased ? 'Done' : 'Back to Matched Jobs'}
                </button>
              </div>
            </div>
          )}

          {/* ── Asking / Submitting / Feedback ────────────────────────── */}
          {(phase === 'asking' || phase === 'submitting' || phase === 'feedback') && (
            <div className="flex-1 flex flex-col md:flex-row overflow-auto md:overflow-hidden min-h-0">

              <LeftPanel
                locked={false}
                questionNumber={questionNumber}
                currentQuestion={currentQuestion}
                answer={answer}
                onAnswerChange={setAnswer}
                error={error}
                phase={phase}
                onSubmit={handleSubmit}
                textareaRef={textareaRef}
              />

              {/* Right panel: placeholder or feedback */}
              <div
                ref={feedbackRef}
                className="md:w-[40%] flex-shrink-0 overflow-y-auto p-5 md:p-8 bg-[#F8FAFC] dark:bg-[#0F172A] md:bg-white md:dark:bg-transparent"
              >
                {phase !== 'feedback' || !feedback ? (
                  <div className="h-full hidden md:flex flex-col items-center justify-center text-center text-gray-300 dark:text-slate-600 space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-[#F8FAFC] dark:bg-[#1E293B] flex items-center justify-center">
                      <span className="text-[30px]">💬</span>
                    </div>
                    <p className="text-[13px] leading-relaxed max-w-[180px]">
                      Feedback will appear here after you submit your answer
                    </p>
                  </div>
                ) : (
                  <FeedbackPanel
                    feedback={feedback}
                    showImproved={showImproved}
                    onToggleImproved={() => setShowImproved(v => !v)}
                    isPro={isPro}
                    questionNumber={questionNumber}
                    onNext={handleNext}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Upgrade gate — two-column layout preserving context ─── */}
          {phase === 'upgrade' && (
            <div className="flex-1 flex flex-col md:flex-row overflow-auto md:overflow-hidden min-h-0">

              {/* Left: question + locked answer (dimmed to signal progress) */}
              <LeftPanel
                locked={true}
                questionNumber={questionNumber}
                currentQuestion={currentQuestion}
                answer={answer}
                onAnswerChange={setAnswer}
                error=""
                phase={phase}
                onSubmit={handleSubmit}
                textareaRef={textareaRef}
              />

              {/* Right: upgrade card */}
              <div className="md:w-[40%] flex-shrink-0 overflow-y-auto p-5 md:p-8 bg-[#F8FAFC] dark:bg-[#0F172A] flex items-center">
                <div className="w-full space-y-5">

                  {/* Progress context bar */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#2563EB] mb-1">Your Progress</p>
                    <p className="text-[15px] font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                      1 of {TOTAL_QUESTIONS} questions complete
                    </p>
                    <div className="flex gap-1.5 mt-2.5">
                      {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-all ${
                            i === 0 ? 'bg-[#2563EB]' : 'bg-[#E5E7EB] dark:bg-[#334155]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Headline + subtext */}
                  <div>
                    <h3 className="text-[20px] font-black text-[#0F172A] dark:text-[#F1F5F9] mb-1.5">
                      Continue Your Interview
                    </h3>
                    <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
                      You've completed 1 of 5 questions. Upgrade to unlock the full mock interview and improve your chances.
                    </p>
                  </div>

                  {/* Benefits */}
                  <div className="space-y-2.5">
                    {[
                      '4 more tailored questions to go',
                      'Deep AI feedback on every answer',
                      'Full interview simulation with scoring',
                    ].map((b, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-[#2563EB]" />
                        </div>
                        <span className="text-[13px] text-gray-600 dark:text-slate-300">{b}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTAs */}
                  <div className="space-y-2.5 pt-1">
                    <a
                      href="/settings"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[14px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all hover:scale-[1.01] active:scale-100 shadow-sm"
                    >
                      <Crown className="w-3.5 h-3.5 text-amber-400" />Upgrade to Pro
                    </a>
                    <button
                      onClick={onClose}
                      className="w-full py-2.5 text-[13px] font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
                    >
                      Exit Interview
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Exit confirmation ──────────────────────────────────────── */}
      {confirmExit && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmExit(false)} />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-6 border border-[#E5E7EB] dark:border-[#334155]">
            <h4 className="font-bold text-[17px] text-[#0F172A] dark:text-[#F1F5F9] mb-1.5">Exit interview?</h4>
            <p className="text-[13px] text-gray-500 dark:text-slate-400 mb-5 leading-relaxed">
              Are you sure you want to exit? Your progress will be lost.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setConfirmExit(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#263549] transition-colors"
              >
                Stay
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-[#DC2626] text-white text-[13px] font-bold hover:bg-red-700 transition-colors"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}

// ── FeedbackPanel ─────────────────────────────────────────────────────────────

function FeedbackPanel({
  feedback, showImproved, onToggleImproved, isPro, questionNumber, onNext,
}: {
  feedback: Feedback
  showImproved: boolean
  onToggleImproved: () => void
  isPro: boolean
  questionNumber: number
  onNext: () => void
}) {
  const nextLabel = !isPro
    ? 'Continue Interview (Upgrade to Pro)'
    : questionNumber >= TOTAL_QUESTIONS
    ? 'Finish Interview'
    : 'Next Question →'

  return (
    <div className="space-y-5">

      {/* Scores */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-slate-500 mb-3">
          Your Scores
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {(Object.entries(feedback.scores) as [string, number][]).map(([key, val]) => (
            <ScoreCard key={key} label={key} value={val} />
          ))}
        </div>
      </div>

      {/* Strengths */}
      {feedback.strengths.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-green-600 dark:text-green-500 mb-2.5">
            Strengths
          </p>
          <ul className="space-y-2">
            {feedback.strengths.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-gray-600 dark:text-slate-300 leading-relaxed">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gaps */}
      {feedback.gaps.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-500 mb-2.5">
            Areas to Improve
          </p>
          <ul className="space-y-2">
            {feedback.gaps.map((g, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-gray-600 dark:text-slate-300 leading-relaxed">
                <span className="text-amber-500 flex-shrink-0 font-bold mt-0.5">→</span>{g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Red flags */}
      {feedback.redFlags.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-red-500 mb-2.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />Red Flags
          </p>
          <ul className="space-y-2">
            {feedback.redFlags.map((r, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-gray-600 dark:text-slate-300 leading-relaxed">
                <span className="text-red-500 flex-shrink-0 font-bold mt-0.5">!</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improved answer (collapsible) */}
      <div className="rounded-xl border border-[#E5E7EB] dark:border-[#334155] overflow-hidden">
        <button
          onClick={onToggleImproved}
          className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-[#1E293B] text-[13px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
        >
          <span>View Improved Answer</span>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showImproved ? 'rotate-90' : ''}`} />
        </button>
        {showImproved && (
          <div className="px-4 py-3 text-[13px] text-gray-600 dark:text-slate-300 leading-relaxed border-t border-[#E5E7EB] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A]">
            {feedback.improvedAnswer}
          </div>
        )}
      </div>

      {/* Next / upgrade CTA */}
      <button
        onClick={onNext}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-[14px] font-bold transition-all hover:scale-[1.01] active:scale-100 shadow-sm ${
          !isPro
            ? 'bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:opacity-90'
            : 'bg-[#0F172A] dark:bg-[#2563EB] hover:bg-[#1E293B] dark:hover:bg-blue-700'
        }`}
      >
        {!isPro && <Crown className="w-3.5 h-3.5 text-amber-300" />}
        {nextLabel}
        {isPro && questionNumber < TOTAL_QUESTIONS && <ChevronRight className="w-4 h-4" />}
      </button>

    </div>
  )
}
