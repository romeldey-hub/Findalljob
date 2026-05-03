import { callClaudeJSON } from './claude'
import type { NormalizedJob, ParsedResume } from '@/types'

export interface RankedJob {
  externalId: string
  score: number
  reasoning: string
  bridge_advice: string
  matched_skills: string[]
  missing_skills: string[]
}

// Internal shape Claude returns — index-based so it never has to repeat long/opaque IDs
interface ClaudeRankedItem {
  index: number
  score: number
  reasoning: string
  bridge_advice: string
  matched_skills: string[]
  missing_skills: string[]
}

const RERANK_SYSTEM_PROMPT = `You are a professional recruiter matching candidates to job opportunities.
Score each job 0-100 based on genuine fit. Be realistic — 85+ means excellent match, 60-84 means good fit with minor gaps, 40-59 means partial fit, below 40 means significant mismatch.
Never inflate scores. A score of 70 is a good match.`

const BATCH_SIZE = 10   // jobs per Claude call
const MAX_TOKENS = 6000 // per batch call — increased for larger job descriptions

function buildPrompt(candidateSummary: string, batch: NormalizedJob[], offset: number): string {
  const jobsList = batch
    .map(
      (j, i) =>
        `[${offset + i}] ${j.title} at ${j.company} (${j.location})
Description: ${(j.description ?? '').slice(0, 1200)}`
    )
    .join('\n\n')

  return `Match this candidate to each job below. For each job return index, score, 2-3 sentence reasoning with specific evidence, a bridge tip, and skill lists.

CANDIDATE:
${candidateSummary}

JOBS:
${jobsList}

Return a JSON array — one entry per job, sorted by score descending:
[
  {
    "index": ${offset},
    "score": 75,
    "reasoning": "2-3 sentences citing specific evidence from the candidate's background that explains fit or gaps.",
    "bridge_advice": "One actionable sentence on how to reframe or address the main skill gap for this specific role.",
    "matched_skills": ["skill1", "skill2"],
    "missing_skills": ["skill3"]
  }
]

Return all ${batch.length} jobs. Use the exact integer shown in [brackets] as "index".`
}

export async function rerankJobs(
  resume: ParsedResume,
  jobs: NormalizedJob[],
  rawText?: string   // full resume text — gives Claude the same context as reading the original
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
            bridge_advice:  r.bridge_advice ?? '',
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
