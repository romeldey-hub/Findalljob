/**
 * AI routing layer.
 *
 * generateLight()       — cheap model; falls back to premium on empty or error
 * generatePremium()     — premium model only
 * generateLightJSON()   — light + JSON parse; falls back to premium on malformed output
 * generatePremiumJSON() — premium + JSON parse
 *
 * Every call:
 *  - emits   [AI ROUTER] task=<name> model=light|premium tokens=<n>
 *  - logs actual token usage + USD cost to ai_usage_events (fire-and-forget)
 *
 * Pass userId + isFreeUser when user context is available so the usage dashboard
 * can attribute costs per user and split free vs paid spend.
 */
import {
  callClaude,
  callClaudeHaiku,
  callClaudeJSON,
  callClaudeJSONHaiku,
} from './claude'
import { logAiEvent } from './usage-logger'

export interface AIOptions {
  task: string
  system?: string
  maxTokens?: number
  userId?: string
  isFreeUser?: boolean
}

function log(task: string, tier: 'light' | 'premium', maxTokens: number): void {
  console.log(`[AI ROUTER] task=${task} model=${tier} tokens=${maxTokens}`)
}

// ── Plain text ────────────────────────────────────────────────────────────────

export async function generateLight(prompt: string, opts: AIOptions): Promise<string> {
  const { task, system, maxTokens = 512, userId, isFreeUser } = opts
  log(task, 'light', maxTokens)
  try {
    const result = await callClaudeHaiku(prompt, system, maxTokens)
    if (!result.text.trim()) {
      logAiEvent({ task, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, userId, isFreeUser })
      console.warn(`[AI ROUTER] task=${task} light→empty, fallback premium`)
      log(`${task}:fallback`, 'premium', maxTokens)
      const fb = await callClaude(prompt, system, maxTokens)
      logAiEvent({ task: `${task}:fallback`, model: fb.model, inputTokens: fb.inputTokens, outputTokens: fb.outputTokens, userId, isFreeUser })
      return fb.text
    }
    logAiEvent({ task, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, userId, isFreeUser })
    return result.text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[AI ROUTER] task=${task} light→error (${msg}), fallback premium`)
    log(`${task}:fallback`, 'premium', maxTokens)
    const fb = await callClaude(prompt, system, maxTokens)
    logAiEvent({ task: `${task}:fallback`, model: fb.model, inputTokens: fb.inputTokens, outputTokens: fb.outputTokens, userId, isFreeUser })
    return fb.text
  }
}

export async function generatePremium(prompt: string, opts: AIOptions): Promise<string> {
  const { task, system, maxTokens = 4096, userId, isFreeUser } = opts
  log(task, 'premium', maxTokens)
  const result = await callClaude(prompt, system, maxTokens)
  logAiEvent({ task, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, userId, isFreeUser })
  return result.text
}

// ── JSON ──────────────────────────────────────────────────────────────────────

export async function generateLightJSON<T>(prompt: string, opts: AIOptions): Promise<T> {
  const { task, system, maxTokens = 512, userId, isFreeUser } = opts
  log(task, 'light', maxTokens)
  try {
    const result = await callClaudeJSONHaiku<T>(prompt, system, maxTokens)
    logAiEvent({ task, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, userId, isFreeUser })
    return result.data
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[AI ROUTER] task=${task} light→failed (${msg}), fallback premium`)
    log(`${task}:fallback`, 'premium', maxTokens)
    const result = await callClaudeJSON<T>(prompt, system, maxTokens)
    logAiEvent({ task: `${task}:fallback`, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, userId, isFreeUser })
    return result.data
  }
}

export async function generatePremiumJSON<T>(prompt: string, opts: AIOptions): Promise<T> {
  const { task, system, maxTokens = 4096, userId, isFreeUser } = opts
  log(task, 'premium', maxTokens)
  const result = await callClaudeJSON<T>(prompt, system, maxTokens)
  logAiEvent({ task, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, userId, isFreeUser })
  return result.data
}
