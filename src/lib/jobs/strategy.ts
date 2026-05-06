import { callClaudeJSON } from '@/lib/ai/claude'
import { createHash }     from 'crypto'
import type { ParsedResume } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompetitorIntel {
  direct:   string[]   // direct competitors — same business, same market
  adjacent: string[]   // lateral adjacents — similar space, same talent pool
}

export interface SearchStrategy {
  search_queries:   string[]
  target_companies: string[]
  competitors:      CompetitorIntel
}

// ── In-memory TTL cache (per serverless instance) ─────────────────────────────

const _cache = new Map<string, { strategy: SearchStrategy; expires: number }>()
const CACHE_TTL_MS  = 30 * 60 * 1000
const MIN_RESUME_LEN = 100

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM = `You are a job search expert and recruiter intelligence engine. Respond ONLY with valid JSON. No markdown, no explanation.`

function buildPrompt(resumeText: string): string {
  return `You are an AI Job Search Optimization Engine with recruiter-level intelligence.

Analyze this resume and generate a competitor-aware search strategy in three steps.

STEP 1 — Identify the candidate's current company (most recent role only):
- Note their industry, company type (Startup | Scale-up | MNC | Unknown), and country/city.

STEP 2 — Find competitor companies IN THE SAME COUNTRY:
- 5–8 DIRECT competitors: same business model, same market segment, direct rivals.
- 5–8 ADJACENT companies: same industry space but different model — lateral moves, similar talent needs.
- Prefer companies that actively hire the candidate's role type in their country.
- If current company is unknown, infer from their industry and role.

STEP 3 — Generate 8–12 clean search queries using this mix:
  • 2 queries: normalized role title + country  (e.g. "Senior Product Manager India")
  • 2 queries: role + industry vertical          (e.g. "Product Manager food delivery India")
  • 3–4 queries: role at a competitor company    (e.g. "Product Manager Swiggy India", "Growth Manager Zepto India")
  • 2 queries: domain-specific compound query    (e.g. "growth manager quick commerce India")
  • 1 broad fallback                             (e.g. "Product Manager India")

Competitor queries MUST use format: "[Role] [CompanyName] [Country]"

Hard rules for ALL queries:
- 2–5 words, no special characters, no keyword stuffing
- Use role titles employers actually post
- Include country name so searches stay geo-relevant
- Prioritize hiring probability over exhaustiveness

Also list 5 target companies most likely to hire this profile right now.

Resume:
${resumeText.slice(0, 2500)}

Return ONLY this JSON:
{
  "search_queries": ["query1", "query2", ..., "query12"],
  "target_companies": ["Company A", "Company B", "Company C", "Company D", "Company E"],
  "competitors": {
    "direct":   ["CompanyA", "CompanyB", "CompanyC", "CompanyD", "CompanyE"],
    "adjacent": ["CompanyF", "CompanyG", "CompanyH", "CompanyI", "CompanyJ"]
  }
}`
}

// ── Fallback: build simple title-based queries without calling Claude ──────────

function fallbackStrategy(parsedResume: ParsedResume): SearchStrategy {
  const title = parsedResume.experience?.[0]?.title?.trim() ?? ''
  const words = title.split(/\s+/).filter(Boolean)
  const queries: string[] = []

  if (title) {
    queries.push(title)
    if (words.length >= 3) queries.push(words.slice(-2).join(' '))
    if (words.length === 2) queries.push(words[0])
  }

  if (queries.length === 0) {
    queries.push(parsedResume.skills?.[0] ?? 'software engineer')
  }

  return {
    search_queries:   [...new Set(queries)].filter(Boolean),
    target_companies: [],
    competitors:      { direct: [], adjacent: [] },
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateSearchStrategy(
  resumeText: string,
  parsedResume?: ParsedResume,
): Promise<SearchStrategy> {
  if (!resumeText || resumeText.trim().length < MIN_RESUME_LEN) {
    console.log('[strategy] resume too short — using fallback')
    return parsedResume
      ? fallbackStrategy(parsedResume)
      : { search_queries: ['software engineer'], target_companies: [], competitors: { direct: [], adjacent: [] } }
  }

  const key = createHash('sha256').update(resumeText.slice(0, 2000)).digest('hex').slice(0, 16)
  const hit  = _cache.get(key)
  if (hit && hit.expires > Date.now()) {
    console.log('[strategy] cache hit:', hit.strategy.search_queries)
    console.log('[strategy] cache hit competitors — direct:', hit.strategy.competitors.direct, '| adjacent:', hit.strategy.competitors.adjacent)
    return hit.strategy
  }

  try {
    const raw      = await callClaudeJSON<SearchStrategy>(buildPrompt(resumeText), SYSTEM, 1500)
    const queries  = (raw.search_queries ?? [])
      .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    const companies = (raw.target_companies ?? [])
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    const direct   = (raw.competitors?.direct ?? [])
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    const adjacent = (raw.competitors?.adjacent ?? [])
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)

    if (queries.length === 0) throw new Error('Claude returned no queries')

    const strategy: SearchStrategy = {
      search_queries:   queries,
      target_companies: companies,
      competitors:      { direct, adjacent },
    }
    _cache.set(key, { strategy, expires: Date.now() + CACHE_TTL_MS })
    console.log('[strategy] queries:', queries)
    console.log('[strategy] target companies:', companies)
    console.log('[strategy] competitors direct:', direct, '| adjacent:', adjacent)
    return strategy

  } catch (err) {
    console.error('[strategy] Claude failed, using fallback:', err instanceof Error ? err.message : err)
    return parsedResume
      ? fallbackStrategy(parsedResume)
      : { search_queries: ['software engineer'], target_companies: [], competitors: { direct: [], adjacent: [] } }
  }
}
