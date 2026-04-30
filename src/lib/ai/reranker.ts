import { callClaudeJSON } from './claude'
import type { NormalizedJob, ParsedResume } from '@/types'

export interface RankedJob {
  externalId: string
  score: number
  reasoning: string
  matched_skills: string[]
  missing_skills: string[]
}

// Internal shape Claude returns — index-based so it never has to repeat long/opaque IDs
interface ClaudeRankedItem {
  index: number
  score: number
  reasoning: string
  matched_skills: string[]
  missing_skills: string[]
}

const RERANK_SYSTEM_PROMPT = `You are a professional recruiter matching candidates to job opportunities.
Score each job 0-100 based on genuine fit. Be realistic — 85+ means excellent match, 60-84 means good fit with minor gaps, 40-59 means partial fit, below 40 means significant mismatch.
Never inflate scores. A score of 70 is a good match.`

const BATCH_SIZE = 10   // jobs per Claude call
const MAX_TOKENS = 4096 // per batch call

function buildPrompt(candidateSummary: string, batch: NormalizedJob[], offset: number): string {
  const jobsList = batch
    .map(
      (j, i) =>
        `[${offset + i}] ${j.title} at ${j.company} (${j.location})
Description: ${(j.description ?? '').slice(0, 400)}`
    )
    .join('\n\n')

  return `Match this candidate to each job below. For each job return its index number, a score, one-sentence reasoning, and skill lists.

CANDIDATE:
${candidateSummary}

JOBS:
${jobsList}

Return a JSON array — one entry per job, sorted by score descending:
[
  {
    "index": ${offset},
    "score": 75,
    "reasoning": "One sentence explaining fit or gaps.",
    "matched_skills": ["skill1", "skill2"],
    "missing_skills": ["skill3"]
  }
]

Return all ${batch.length} jobs. Use the exact integer shown in the [brackets] as "index". Do not include the job title or ID — only the integer index.`
}

export async function rerankJobs(
  resume: ParsedResume,
  jobs: NormalizedJob[]
): Promise<RankedJob[]> {
  const skills     = Array.isArray(resume.skills)     ? resume.skills     : []
  const experience = Array.isArray(resume.experience) ? resume.experience : []

  const candidateSummary = `Name: ${resume.name ?? 'Unknown'}
Skills: ${skills.slice(0, 20).join(', ') || 'Not specified'}
Recent Experience: ${experience.slice(0, 3).map((e) => `${e.title ?? ''} at ${e.company ?? ''}`).join('; ') || 'Not specified'}
Summary: ${(resume.summary ?? '').slice(0, 300) || 'Not provided'}`

  const batches: NormalizedJob[][] = []
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    batches.push(jobs.slice(i, i + BATCH_SIZE))
  }

  const batchResults = await Promise.all(
    batches.map((batch, batchIdx) => {
      const offset = batchIdx * BATCH_SIZE
      return callClaudeJSON<ClaudeRankedItem[]>(
        buildPrompt(candidateSummary, batch, offset),
        RERANK_SYSTEM_PROMPT,
        MAX_TOKENS
      )
        .then((items): RankedJob[] => {
          const valid = items.filter(
            (r) => typeof r.index === 'number' && r.index >= 0 && r.index < jobs.length
          )
          console.log(`[reranker] batch ${batchIdx}: Claude returned ${items.length} items, ${valid.length} valid`)
          return valid.map((r) => ({
            externalId:     jobs[r.index].externalId,   // safe — index comes from AI, mapped here
            score:          Math.min(100, Math.max(0, Number(r.score) || 0)),
            reasoning:      r.reasoning ?? '',
            matched_skills: Array.isArray(r.matched_skills) ? r.matched_skills : [],
            missing_skills: Array.isArray(r.missing_skills) ? r.missing_skills : [],
          }))
        })
        .catch((err) => {
          console.error(`[reranker] batch ${batchIdx} failed:`, err instanceof Error ? err.message : err)
          return [] as RankedJob[]
        })
    })
  )

  const allRanked = batchResults.flat()
  console.log(`[reranker] total ranked: ${allRanked.length} of ${jobs.length} input jobs`)
  return allRanked.sort((a, b) => b.score - a.score)
}
