'use client'

import { useState, useRef, useEffect } from 'react'
import type { ActivityStep } from '@/components/ProgressiveActivity'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StepDefinition {
  label: string
  defaultDescription: string
}

interface RuntimeProgressState {
  currentStep: number
  steps: ActivityStep[]
  startedAt: number
  lastStepChangedAt: number
}

interface UseAnalyzeProgressOptions {
  stepDefs: StepDefinition[]
  stepMap: Record<string, number>
  /** Minimum milliseconds to show a step before advancing. Default 10 000 (10 s). */
  minStepMs?: number
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages the RuntimeProgressState for the "Updating your matches" / "Matching
 * your resume" progress panels.
 *
 * Steps advance based on two conditions being true simultaneously:
 *   1. The server (via SSE) has signalled it has reached or passed that step.
 *   2. The current step has been displayed for at least `minStepMs`.
 *
 * The final step is NEVER auto-completed — only a `done` SSE event can close it.
 */
export function useAnalyzeProgress({
  stepDefs,
  stepMap,
  minStepMs = 10_000,
}: UseAnalyzeProgressOptions) {
  const lastStepIdx = stepDefs.length - 1

  // ── State ─────────────────────────────────────────────────────────────────

  const [state, setState] = useState<RuntimeProgressState>(() =>
    makeState(stepDefs, 0)
  )

  // Refs used inside the polling interval (avoid stale-closure issues).
  const intendedStepRef    = useRef(0)    // furthest step the server has reached
  const isActiveRef        = useRef(false) // true while analyze is running
  const stepDefsRef        = useRef(stepDefs)
  const stepMapRef         = useRef(stepMap)
  const lastStepIdxRef     = useRef(lastStepIdx)

  useEffect(() => {
    stepDefsRef.current    = stepDefs
    stepMapRef.current     = stepMap
    lastStepIdxRef.current = lastStepIdx
  }, [stepDefs, stepMap, lastStepIdx])

  // ── Polling loop ──────────────────────────────────────────────────────────
  // Runs every second. Advances the VISIBLE step only when both conditions
  // are met: (a) server is ahead, AND (b) min display time has elapsed.

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isActiveRef.current) return

      setState(prev => {
        const now     = Date.now()
        const elapsed = now - prev.lastStepChangedAt
        const intended = intendedStepRef.current

        // Never auto-advance the final step
        if (prev.currentStep >= lastStepIdxRef.current) return prev
        // Server hasn't signalled we should be here yet
        if (prev.currentStep >= intended)               return prev
        // Haven't shown the current step long enough
        if (elapsed < minStepMs)                        return prev

        const next = prev.currentStep + 1
        return {
          ...prev,
          currentStep: next,
          lastStepChangedAt: now,
          steps: prev.steps.map((s, i) => ({
            ...s,
            status:
              i < next            ? 'done'
              : i === next        ? 'active'
              : s.status === 'error' ? 'error'
              : 'pending',
          })),
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [minStepMs, lastStepIdx])

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * (Re)start progress from a given step (0 by default).
   * Call this right before starting the fetch.
   */
  function reset(initialStep = 0) {
    isActiveRef.current     = true
    intendedStepRef.current = initialStep
    setState(makeState(stepDefsRef.current, initialStep))
  }

  /**
   * Feed a parsed SSE event from the analyze stream into the progress state.
   * Updates the intended step and enriches descriptions with live data.
   */
  function onSSEEvent(event: Record<string, unknown>) {
    const step = event.step as string | undefined

    // ── Advance intended step ──────────────────────────────────────────────
    if (step && step in stepMapRef.current) {
      const targetIdx = stepMapRef.current[step]
      intendedStepRef.current = Math.max(intendedStepRef.current, targetIdx)

      // ── Update dynamic descriptions ──────────────────────────────────────
      setState(prev => {
        const steps = prev.steps.map(s => ({ ...s }))

        if (step === 'jobs_fetching') {
          const count   = typeof event.count === 'number' ? event.count : 0
          const sources = Array.isArray(event.sources)
            ? (event.sources as string[])
            : []
          const idx = stepMapRef.current['jobs_fetching']

          if (idx !== undefined && steps[idx] && count > 0) {
            const srcPart = sources.length > 0
              ? ` · ${sources.slice(0, 4).join(', ')}`
              : ''
            steps[idx] = {
              ...steps[idx],
              description: `Found ${count} listings${srcPart}…`,
            }
          }

          // Pre-fill the "pool / relevance" step with count so it's ready
          const poolIdx = stepMapRef.current['pool_selected']
          if (poolIdx !== undefined && steps[poolIdx] && count > 0) {
            steps[poolIdx] = {
              ...steps[poolIdx],
              description: `Reviewing ${count} listings for relevance…`,
            }
          }
        }

        if (step === 'pool_selected') {
          const count = typeof event.count === 'number' ? event.count : 0
          const idx   = stepMapRef.current['pool_selected']

          if (idx !== undefined && steps[idx] && count > 0) {
            steps[idx] = {
              ...steps[idx],
              description: `Evaluating top ${count} listings…`,
            }
          }

          // Pre-fill AI-scoring step
          const rankIdx = stepMapRef.current['ai_ranking']
          if (rankIdx !== undefined && steps[rankIdx] && count > 0) {
            steps[rankIdx] = {
              ...steps[rankIdx],
              description: `AI is scoring ${count} jobs against your profile…`,
            }
          }
        }

        return { ...prev, steps }
      })
    }

    // ── Done: mark all steps complete ─────────────────────────────────────
    if (event.done) {
      isActiveRef.current = false
      setState(prev => ({
        ...prev,
        currentStep: lastStepIdxRef.current,
        steps: prev.steps.map(s => ({ ...s, status: 'done' })),
      }))
    }

    // ── Error: freeze current step as errored ─────────────────────────────
    if (event.error) {
      isActiveRef.current = false
      setState(prev => ({
        ...prev,
        steps: prev.steps.map((s, i) => ({
          ...s,
          status:
            i < prev.currentStep  ? 'done'
            : i === prev.currentStep ? 'error'
            : 'pending',
        })),
      }))
    }
  }

  /** Hard-stop (e.g. network error before stream starts). */
  function stop() {
    isActiveRef.current = false
    setState(prev => ({
      ...prev,
      steps: prev.steps.map((s, i) => ({
        ...s,
        status: i < prev.currentStep ? 'done' : i === prev.currentStep ? 'error' : 'pending',
      })),
    }))
  }

  return { activitySteps: state.steps, onSSEEvent, reset, stop }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function makeState(stepDefs: StepDefinition[], initialStep: number): RuntimeProgressState {
  const now = Date.now()
  return {
    currentStep: initialStep,
    startedAt: now,
    lastStepChangedAt: now,
    steps: stepDefs.map((s, i) => ({
      label: s.label,
      description: s.defaultDescription,
      status:
        i < initialStep  ? 'done'
        : i === initialStep ? 'active'
        : 'pending',
    })),
  }
}
