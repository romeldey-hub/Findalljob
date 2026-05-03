import { callClaudeJSON } from '@/lib/ai/claude'
import { createHash }     from 'crypto'
import type { ParsedResume } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchStrategy {
  search_queries: string[]
}

// ── In-memory TTL cache (per serverless instance) ─────────────────────────────

const _cache = new Map<string, { strategy: SearchStrategy; expires: number }>()
const CACHE_TTL_MS = 6 * 60 * 60 * 1000   // 6 hours
const MIN_RESUME_LEN = 100                 // skip Claude if resume text is too short

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM = `You are a job-board search expert. Respond ONLY with valid JSON. No markdown, no explanation.`

function buildPrompt(resumeText: string): string {
  return `Analyze this resume and generate 6 targeted job search queries for Naukri, LinkedIn, and Indeed.

Generate a MIX of two types:
(A) Exact job titles employers post — 2-4 words, e.g. "Business Development Director", "Sales Head"
(B) Domain-compound queries — role + industry/expertise area, e.g. "government procurement sales", "semiconductor OEM enterprise", "GeM marketplace director"

Rules:
- Queries 1-2: exact job titles (primary role + one seniority/synonym variant)
- Queries 3-5: domain-compound queries encoding the candidate's industry sector, domain expertise, and key technologies from the resume
- Query 6: broad fallback title (most general form of their role)
- No location, no soft skills, no generic terms like "professional" or "expert"

Resume (first 2500 chars):
${resumeText.slice(0, 2500)}

Return ONLY this JSON:
{
  "search_queries": ["Title 1", "Title 2", "Domain compound 3", "Domain compound 4", "Domain compound 5", "Broad fallback 6"]
}`
}

// ── Fallback: build simple title-based queries without calling Claude ──────────

function fallbackStrategy(parsedResume: ParsedResume): SearchStrategy {
  const title = parsedResume.experience?.[0]?.title?.trim() ?? ''
  const words = title.split(/\s+/).filter(Boolean)
  const queries: string[] = []

  if (title) {
    queries.push(title)
    // For 3+ word titles add last-2-word variant ("Senior Software Engineer" → "Software Engineer")
    if (words.length >= 3) queries.push(words.slice(-2).join(' '))
    // For 2-word titles add first-word variant ("Operations Executive" → "Operations")
    if (words.length === 2) queries.push(words[0])
  }

  if (queries.length === 0) {
    queries.push(parsedResume.skills?.[0] ?? 'software engineer')
  }

  return { search_queries: [...new Set(queries)].filter(Boolean) }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates AI-driven search queries from a resume.
 *
 * - Uses Claude to produce 4 targeted job title variants
 * - In-memory cache (6 h TTL, keyed by resume content hash)
 * - Automatically falls back to title-based queries if Claude fails or resume is too short
 */
export async function generateSearchStrategy(
  resumeText: string,
  parsedResume?: ParsedResume,
): Promise<SearchStrategy> {
  // Skip Claude entirely if there's not enough resume text
  if (!resumeText || resumeText.trim().length < MIN_RESUME_LEN) {
    console.log('[strategy] resume too short — using fallback')
    return parsedResume ? fallbackStrategy(parsedResume) : { search_queries: ['software engineer'] }
  }

  // In-memory cache keyed by a 16-char prefix of the SHA-256 of the first 2000 chars
  const key = createHash('sha256').update(resumeText.slice(0, 2000)).digest('hex').slice(0, 16)
  const hit  = _cache.get(key)
  if (hit && hit.expires > Date.now()) {
    console.log('[strategy] cache hit:', hit.strategy.search_queries)
    return hit.strategy
  }

  try {
    const raw     = await callClaudeJSON<SearchStrategy>(buildPrompt(resumeText), SYSTEM, 512)
    const queries = (raw.search_queries ?? [])
      .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)

    if (queries.length === 0) throw new Error('Claude returned no queries')

    const strategy: SearchStrategy = { search_queries: queries }
    _cache.set(key, { strategy, expires: Date.now() + CACHE_TTL_MS })
    console.log('[strategy] Claude generated:', queries)
    return strategy

  } catch (err) {
    console.error('[strategy] Claude failed, using fallback:', err instanceof Error ? err.message : err)
    return parsedResume ? fallbackStrategy(parsedResume) : { search_queries: ['software engineer'] }
  }
}
