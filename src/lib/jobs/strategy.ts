import { callClaudeJSON } from '@/lib/ai/claude'
import { createHash }     from 'crypto'
import type { ParsedResume } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchStrategy {
  search_queries:   string[]
  target_companies: string[]   // companies likely hiring this profile — used for targeted search
}

// ── In-memory TTL cache (per serverless instance) ─────────────────────────────

const _cache = new Map<string, { strategy: SearchStrategy; expires: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000   // 30 min — short enough that re-analyze always gets fresh queries
const MIN_RESUME_LEN = 100             // skip Claude if resume text is too short

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM = `You are a job search expert. Respond ONLY with valid JSON. No markdown, no explanation.`

function buildPrompt(resumeText: string): string {
  return `Study this resume and generate job search queries that will find real, relevant job listings on Naukri and LinkedIn India.

Look at what the candidate actually does day-to-day, not just their official title. Generate queries that reflect their real function:
- Focus on their core domain (e.g. enterprise sales, government procurement, software engineering)
- Include role titles that employers actually post on Naukri/LinkedIn
- Mix specific role titles with domain+function compound queries

Generate 6 queries:
- 1-2: Role titles matching the candidate's actual work (may differ from their official title)
- 3-4: Domain+function compound queries, e.g. "enterprise sales IT hardware", "government business development"
- 5: A senior/next-level version of their primary role
- 6: Broadest fallback role title

Also generate 5 target companies in the same industry that actively hire this profile (competitors, partners, channel leaders in the candidate's region).

Hard rules:
- 2-5 words per query, no special characters
- Use terms employers actually use in Indian job postings
- No location, no soft skills, no words like "expert" or "professional"

Resume:
${resumeText.slice(0, 2500)}

Return ONLY this JSON:
{
  "search_queries": ["query1", "query2", "query3", "query4", "query5", "query6"],
  "target_companies": ["Company A", "Company B", "Company C", "Company D", "Company E"]
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

  return { search_queries: [...new Set(queries)].filter(Boolean), target_companies: [] }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateSearchStrategy(
  resumeText: string,
  parsedResume?: ParsedResume,
): Promise<SearchStrategy> {
  if (!resumeText || resumeText.trim().length < MIN_RESUME_LEN) {
    console.log('[strategy] resume too short — using fallback')
    return parsedResume ? fallbackStrategy(parsedResume) : { search_queries: ['software engineer'], target_companies: [] }
  }

  const key = createHash('sha256').update(resumeText.slice(0, 2000)).digest('hex').slice(0, 16)
  const hit  = _cache.get(key)
  if (hit && hit.expires > Date.now()) {
    console.log('[strategy] cache hit:', hit.strategy.search_queries, '| companies:', hit.strategy.target_companies)
    return hit.strategy
  }

  try {
    const raw      = await callClaudeJSON<SearchStrategy>(buildPrompt(resumeText), SYSTEM, 768)
    const queries  = (raw.search_queries ?? [])
      .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    const companies = (raw.target_companies ?? [])
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)

    if (queries.length === 0) throw new Error('Claude returned no queries')

    const strategy: SearchStrategy = { search_queries: queries, target_companies: companies }
    _cache.set(key, { strategy, expires: Date.now() + CACHE_TTL_MS })
    console.log('[strategy] Claude generated queries:', queries)
    console.log('[strategy] Claude generated companies:', companies)
    return strategy

  } catch (err) {
    console.error('[strategy] Claude failed, using fallback:', err instanceof Error ? err.message : err)
    return parsedResume ? fallbackStrategy(parsedResume) : { search_queries: ['software engineer'], target_companies: [] }
  }
}
