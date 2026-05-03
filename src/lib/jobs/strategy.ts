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

const SYSTEM = `You are a job-board search expert. Respond ONLY with valid JSON. No markdown, no explanation.`

function buildPrompt(resumeText: string): string {
  return `You are a senior recruiter. Study this resume and generate search queries + target companies that surface the BEST-FITTING job postings for this candidate.

CRITICAL RULE — IGNORE THE OFFICIAL JOB TITLE. Focus on what the candidate ACTUALLY DOES:
- A "Field Application Engineer" who manages enterprise accounts, government tenders, GeM procurement, and OEM partnerships → is an Enterprise Sales / Business Development leader. Search for THOSE roles.
- A "Software Engineer" who leads ML pipelines and sprint planning → is a ML Engineer / Tech Lead. Search for THOSE roles.
- The right query finds the job they QUALIFY FOR, not the title on their current business card.

Generate:
- Queries 1-2: DESTINATION job titles — senior role titles this candidate should be applying for next, based on their actual responsibilities and seniority (NOT their current official title)
- Queries 3-5: DOMAIN-COMPOUND queries — key expertise area + industry + function, e.g. "enterprise sales IT hardware India", "government business development semiconductor", "GeM procurement technology manager"
- Query 6: BROAD fallback — most general form of their highest-value transferable role

ALSO generate exactly 5 target companies:
- Companies in the same industry ecosystem that actively hire this type of profile
- Think: competitors of their current employer, major customers, channel partners, adjacent sector leaders in India
- Example for a semiconductor FAE in Delhi NCR: Intel India, Qualcomm India, NXP Semiconductors India, Rashi Peripherals, Ingram Micro India
- Example for an IT hardware enterprise sales leader: companies selling IT infrastructure/hardware to government/enterprise in the candidate's geography
- Use real, specific company names — no generic descriptions

Hard rules for queries:
- No special characters: no / \\ | & () punctuation
- Spell out abbreviations: FAE → Field Application Engineer, BD → Business Development, GeM → Government eMarketplace
- 2-5 words per query, no location, no soft skills, no generic words like "professional" or "expert"

Resume (first 2500 chars):
${resumeText.slice(0, 2500)}

Return ONLY this JSON:
{
  "search_queries": ["Destination Title 1", "Destination Title 2", "Domain compound 3", "Domain compound 4", "Domain compound 5", "Broad fallback 6"],
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
