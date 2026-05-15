import { generatePremiumJSON } from './client'
import type { JobSource, NormalizedJob, ParsedResume } from '@/types'

export interface RankedJob {
  externalId: string
  source: JobSource
  score: number
  reasoning: string
  bridge_advice: string
  match_reasons: string[]
  matched_skills: string[]
  missing_skills: string[]
}

// Internal shape Claude returns — index-based so it never has to repeat long/opaque IDs
interface ClaudeRankedItem {
  index: number
  score: number
  reasoning: string
  bridge_advice: string
  match_reasons: string[]
  matched_skills: string[]
  missing_skills: string[]
}

const RERANK_SYSTEM_PROMPT = `You are an AI recruiter, executive career strategist, and job-hunting engine. Your job is to match candidates to roles where they will genuinely thrive and advance their career.
Score each job 0-100 based on genuine fit. Be realistic — 85+ means excellent match, 60-84 means good fit with minor gaps, 40-59 means partial fit, below 40 means significant mismatch.
Think like a headhunter placing a senior executive: look past the job title and assess whether the candidate's actual experience, domain expertise, and career trajectory make them the right person for this role.
When competitor companies are listed, treat them as high-value targets — these employers immediately recognise the candidate's domain expertise and are actively poaching from rivals.
Never inflate scores beyond what the evidence supports. A score of 70 is a good match.`

const BATCH_SIZE      = 10
const MAX_TOKENS      = 6000
const RETRY_DELAYS_MS = [2500, 7000, 15000]
const CACHE_TTL_MS    = 5 * 60 * 1000 // 5 minutes

interface CacheEntry { result: RankedJob[]; ts: number }
const rankCache = new Map<string, CacheEntry>()

function cacheKey(candidateSummary: string, jobIds: string[]): string {
  const idHash = jobIds.slice().sort().join(',')
  // Simple cheap hash — good enough for cache keying
  let h = 0
  for (let i = 0; i < candidateSummary.length; i++) h = (Math.imul(31, h) + candidateSummary.charCodeAt(i)) | 0
  return `${h}:${idHash}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /rate limit|429|too many requests/i.test(message)
}

function buildPrompt(
  candidateSummary: string,
  batch: NormalizedJob[],
  offset: number,
  competitorCompanies?: string[],
): string {
  const jobsList = batch
    .map(
      (j, i) =>
        `[${offset + i}] ${j.title} at ${j.company} (${j.location})
Description: ${(j.description ?? '').slice(0, 1200)}`
    )
    .join('\n\n')

  const competitorContext = competitorCompanies?.length
    ? `\nCOMPETITOR COMPANIES — apply a 5–10 point bonus to any job at these companies if the base fit is already solid (≥50 before bonus). These employers recognise the candidate's domain expertise and are likely poaching talent:
${competitorCompanies.slice(0, 15).join(', ')}\n`
    : ''

  return `Match this candidate to each job below. For each job return index, score, 2-3 sentence reasoning with specific evidence, a bridge tip, and skill lists.

CANDIDATE:
${candidateSummary}
${competitorContext}
JOBS:
${jobsList}

Return a JSON array — one entry per job, sorted by score descending:
[
  {
    "index": ${offset},
    "score": 75,
    "reasoning": "2-3 sentences citing specific evidence from the candidate's background that explains fit or gaps.",
    "bridge_advice": "One actionable sentence on how to reframe or address the main skill gap for this specific role.",
    "match_reasons": ["Short narrative phrase (max 10 words) citing specific resume evidence vs job requirement — e.g. '8 yrs FAE experience at Intel/AMD', 'OEM channel background (HP, Dell, Lenovo)'"],
    "matched_skills": ["keyword1", "keyword2"],
    "missing_skills": ["gap1"]
  }
]

match_reasons rules: 2-3 items, human-readable narrative phrases not just keywords, cite candidate's actual experience or skills, max 10-12 words each, positive framing.

Return all ${batch.length} jobs. Use the exact integer shown in [brackets] as "index".`
}

export async function rerankJobs(
  resume: ParsedResume,
  jobs: NormalizedJob[],
  rawText?: string,
  competitorCompanies?: string[],  // direct + adjacent competitors — used for scoring boost
  userId?: string,
  isFreeUser?: boolean,
): Promise<RankedJob[]> {
  const skills     = Array.isArray(resume.skills)     ? resume.skills     : []
  const experience = Array.isArray(resume.experience) ? resume.experience : []
  const education  = Array.isArray(resume.education)  ? resume.education  : []

  let candidateSummary: string

  if (rawText && rawText.trim().length > 200) {
    // Full resume text preserves domain-specific terminology, government body names,
    // relationship capital, and achievements that get compressed out of structured summaries.
    candidateSummary = `FULL RESUME:\n${rawText.slice(0, 2500)}`
  } else {
    const expLines = experience.slice(0, 5).map((e) => {
      const bullets = (e.bullets ?? []).slice(0, 2).join('; ')
      return `• ${e.title ?? ''} at ${e.company ?? ''} (${e.start_date ?? ''}–${e.end_date ?? 'Present'})${bullets ? ': ' + bullets : ''}`
    }).join('\n')
    const eduLine = education.slice(0, 2).map((e) =>
      `${e.degree ?? ''} ${e.field ?? ''} – ${e.school ?? ''} (${e.graduation_year ?? ''})`
    ).join(', ')
    candidateSummary = `Name: ${resume.name ?? 'Unknown'}
Profile: ${(resume.summary ?? '').slice(0, 500) || 'Not provided'}
Key Skills: ${skills.slice(0, 30).join(', ') || 'Not specified'}
Experience:
${expLines || 'Not specified'}
Education: ${eduLine || 'Not specified'}`
  }

  // Check in-memory cache before making any AI calls
  const jobIds = jobs.map(j => `${j.source}:${j.externalId}`)
  const key    = cacheKey(candidateSummary, jobIds)
  const cached = rankCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[reranker] cache hit for ${jobs.length} jobs`)
    return cached.result
  }

  const batches: NormalizedJob[][] = []
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    batches.push(jobs.slice(i, i + BATCH_SIZE))
  }

  const batchResults: RankedJob[][] = []

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch  = batches[batchIdx]
    const offset = batchIdx * BATCH_SIZE

    let rankedBatch: RankedJob[] = []
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const items = await generatePremiumJSON<ClaudeRankedItem[]>(
          buildPrompt(candidateSummary, batch, offset, competitorCompanies),
          { task: 'job_rerank', system: RERANK_SYSTEM_PROMPT, maxTokens: MAX_TOKENS, userId, isFreeUser }
        )
        const valid = items.filter(
          (r) => typeof r.index === 'number' && r.index >= 0 && r.index < jobs.length
        )
        console.log(`[reranker] batch ${batchIdx}: Claude returned ${items.length} items, ${valid.length} valid`)
        rankedBatch = valid.map((r) => ({
          externalId:     jobs[r.index].externalId,
          source:         jobs[r.index].source,
          score:          Math.min(100, Math.max(0, Number(r.score) || 0)),
          reasoning:      r.reasoning ?? '',
          bridge_advice:  r.bridge_advice ?? '',
          match_reasons:  Array.isArray(r.match_reasons) ? r.match_reasons : [],
          matched_skills: Array.isArray(r.matched_skills) ? r.matched_skills : [],
          missing_skills: Array.isArray(r.missing_skills) ? r.missing_skills : [],
        }))
        break
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const delay = RETRY_DELAYS_MS[attempt]
        if (!delay || !isRateLimitError(err)) {
          console.error(`[reranker] batch ${batchIdx} failed:`, message)
          break
        }
        console.warn(`[reranker] batch ${batchIdx} rate-limited; retrying in ${delay}ms`)
        await sleep(delay)
      }
    }
    batchResults.push(rankedBatch)
  }

  const allRanked = batchResults.flat().sort((a, b) => b.score - a.score)
  console.log(`[reranker] total ranked: ${allRanked.length} of ${jobs.length} input jobs`)

  // Claude sometimes omits jobs it considers weak matches despite "Return all N jobs".
  // Add back only jobs with meaningful keyword overlap (≥ 2 title tokens match the resume)
  // so the pool isn't padded with completely irrelevant entries at near-zero scores.
  const rankedKeys = new Set(allRanked.map((r) => `${r.source}:${r.externalId}`))
  let filled = 0
  for (const job of jobs) {
    if (rankedKeys.has(`${job.source}:${job.externalId}`)) continue
    const titleTokens  = (job.title  ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length >= 3)
    const resumeTokens = new Set([
      ...Array.isArray(resume.skills) ? resume.skills.map((s) => s.toLowerCase()) : [],
      ...(resume.experience ?? []).flatMap((e) => (e.title ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)),
    ])
    const overlap = titleTokens.filter((t) => resumeTokens.has(t)).length
    // Only add back if there's at least minimal title-level relevance (2+ matching tokens).
    // Jobs with 0-1 overlap were intentionally omitted by Claude; keep them out of the pool
    // so they never surface as filler results on the Matched Jobs page.
    if (overlap < 2) continue
    const fallback = Math.min(38, 28 + overlap * 2)  // 30–38 range for borderline entries
    allRanked.push({
      externalId:     job.externalId,
      source:         job.source,
      score:          fallback,
      reasoning:      '',
      bridge_advice:  '',
      match_reasons:  [],
      matched_skills: titleTokens.filter((t) => resumeTokens.has(t)),
      missing_skills: [],
    })
    filled++
  }
  if (filled > 0) {
    console.log(`[reranker] filled ${filled} omitted jobs with fallback keyword scores`)
    allRanked.sort((a, b) => b.score - a.score)
  }

  // Store in cache and evict stale entries
  rankCache.set(key, { result: allRanked, ts: Date.now() })
  for (const [k, v] of rankCache) {
    if (Date.now() - v.ts >= CACHE_TTL_MS) rankCache.delete(k)
  }

  return allRanked
}
