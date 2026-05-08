import Anthropic from '@anthropic-ai/sdk'
import { LIGHT_MODEL, PREMIUM_MODEL } from './models'

export function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

export const MODEL       = PREMIUM_MODEL
export const MODEL_HAIKU = LIGHT_MODEL

// ── Internal result types (consumed only by client.ts) ───────────────────────

export interface ClaudeRaw {
  text: string
  inputTokens: number
  outputTokens: number
  model: string
}

export interface ClaudeJson<T> {
  data: T
  inputTokens: number
  outputTokens: number
  model: string
}

/** Translate Anthropic API errors into user-readable messages. */
function translateAnthropicError(err: unknown): Error {
  if (err instanceof Anthropic.APIError) {
    const msg = String((err.error as Record<string, unknown>)?.message ?? err.message ?? '')
    if (msg.toLowerCase().includes('credit balance') || msg.toLowerCase().includes('too low')) {
      return new Error('AI features are temporarily unavailable — Anthropic API credits exhausted. Please top up at console.anthropic.com/settings/billing.')
    }
    if (err.status === 401) {
      return new Error('Anthropic API key is invalid or missing. Check ANTHROPIC_API_KEY in your environment.')
    }
    if (err.status === 429) {
      return new Error('Anthropic rate limit reached. Please wait a moment and try again.')
    }
    if (err.status === 529 || err.status === 503) {
      return new Error('Anthropic API is temporarily overloaded. Please try again in a few seconds.')
    }
    return new Error(`Anthropic API error (${err.status}): ${msg || err.message}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

async function callClaudeModel(
  model: string,
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<ClaudeRaw> {
  let response
  try {
    response = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })
  } catch (err) {
    throw translateAnthropicError(err)
  }

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  return {
    text:         content.text,
    inputTokens:  response.usage?.input_tokens  ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    model,
  }
}

export async function callClaude(
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<ClaudeRaw> {
  return callClaudeModel(MODEL, prompt, systemPrompt, maxTokens)
}

export async function callClaudeHaiku(
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<ClaudeRaw> {
  return callClaudeModel(MODEL_HAIKU, prompt, systemPrompt, maxTokens)
}

export async function callClaudeJSON<T>(
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<ClaudeJson<T>> {
  const fullSystem = `${systemPrompt ?? ''}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no explanation — just the raw JSON object.`

  const raw     = await callClaude(prompt, fullSystem, maxTokens)
  const cleaned = raw.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    return { data: JSON.parse(cleaned) as T, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, model: raw.model }
  } catch {
    const salvaged = salvageJsonArray(cleaned)
    if (salvaged !== null) return { data: salvaged as T, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, model: raw.model }
    throw new Error(`JSON parse failed. Response may have been truncated. First 200 chars: ${cleaned.slice(0, 200)}`)
  }
}

export async function callClaudeJSONHaiku<T>(
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096
): Promise<ClaudeJson<T>> {
  const fullSystem = `${systemPrompt ?? ''}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no explanation — just the raw JSON object.`

  const raw     = await callClaudeHaiku(prompt, fullSystem, maxTokens)
  const cleaned = raw.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    return { data: JSON.parse(cleaned) as T, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, model: raw.model }
  } catch {
    const salvaged = salvageJsonArray(cleaned)
    if (salvaged !== null) return { data: salvaged as T, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, model: raw.model }
    throw new Error(`JSON parse failed. Response may have been truncated. First 200 chars: ${cleaned.slice(0, 200)}`)
  }
}

/**
 * When a JSON array response is cut off mid-stream (max_tokens reached),
 * extract every complete { ... } object up to the truncation point.
 */
function salvageJsonArray(text: string): unknown[] | null {
  const arrayStart = text.indexOf('[')
  if (arrayStart === -1) return null

  const results: unknown[] = []
  let depth = 0
  let inString = false
  let escape = false
  let objStart = -1

  for (let i = arrayStart + 1; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue

    if (ch === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        try {
          results.push(JSON.parse(text.slice(objStart, i + 1)))
        } catch { /* skip malformed object */ }
        objStart = -1
      }
    }
  }

  return results.length > 0 ? results : null
}
