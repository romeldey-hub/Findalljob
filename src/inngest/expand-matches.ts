import { inngest } from './client'
import { rerankJobs } from '@/lib/ai/reranker'
import { JobSourceRouter } from '@/lib/jobs/router'
import { createAdminClient } from '@/lib/supabase/server'
import type { NormalizedJob, ParsedResume } from '@/types'

type StepRun = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }
type ExpandMatchesEvent = {
  data: {
    userId: string
    resumeId: string
    queries: string[]
    location: string
    countryCode?: string
  }
}

function addUnique(target: NormalizedJob[], seen: Set<string>, incoming: NormalizedJob[], perSourceLimit = 12) {
  const sourceCounts = new Map<string, number>()
  for (const job of incoming) {
    const sourceCount = sourceCounts.get(job.source) ?? 0
    if (sourceCount >= perSourceLimit) continue
    const key = `${job.source}:${job.externalId}`
    if (seen.has(key)) continue
    seen.add(key)
    target.push(job)
    sourceCounts.set(job.source, sourceCount + 1)
  }
}

export const expandMatchesJob = inngest.createFunction(
  {
    id: 'expand-job-matches',
    name: 'Expand Job Matches With Slow Sources',
    retries: 1,
    triggers: [{ event: 'jobs/expand-matches-requested' }],
    concurrency: { limit: 3 },
  },
  async (ctx: { event: ExpandMatchesEvent; step: StepRun }) => {
    const { userId, resumeId, queries, location, countryCode } = ctx.event.data

    const resume = await ctx.step.run('fetch-resume', async () => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('resumes')
        .select('id, parsed_data, raw_text, is_active')
        .eq('id', resumeId)
        .eq('user_id', userId)
        .single()
      if (error || !data) throw new Error(`Resume not found: ${error?.message ?? 'missing'}`)
      if (!data.is_active) throw new Error('Resume is no longer active')
      return data
    })

    const parsedResume = resume.parsed_data as ParsedResume
    const jobs = await ctx.step.run('fetch-apify-jobs', async () => {
      const router = new JobSourceRouter()
      const out: NormalizedJob[] = []
      const seen = new Set<string>()

      for (const query of queries.slice(0, 3)) {
        const result = await router.search({ title: query, location, countryCode, limit: 25 }, 'fallback')
        addUnique(out, seen, result.jobs, 12)
        if (out.length >= 35) break
      }

      return out
    })

    if (!jobs.length) return { added: 0, reason: 'no-apify-jobs' }

    await ctx.step.run('store-apify-jobs', async () => {
      const admin = createAdminClient()
      const rows = jobs.map((j) => ({
        external_id:  j.externalId,
        source:       j.source,
        title:        j.title,
        company:      j.company,
        location:     j.location,
        description:  j.description,
        url:          j.url,
        apply_url:    j.applyUrl ?? j.url,
        salary:       j.salary ?? null,
        requirements: {},
        scraped_at:   new Date().toISOString(),
        apply_status: 'unverified',
      }))

      const { error } = await admin.from('jobs').upsert(rows, { onConflict: 'external_id,source' })
      if (error) throw new Error(`Failed to store Apify jobs: ${error.message}`)
    })

    const dbJobs = await ctx.step.run('resolve-db-jobs', async () => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('jobs')
        .select('id, external_id, source')
        .in('external_id', jobs.map((j) => j.externalId))
      if (error) throw new Error(`Failed to resolve Apify jobs: ${error.message}`)
      return data ?? []
    })

    const extToDbId = new Map(dbJobs.map((j) => [`${j.source}:${j.external_id}`, j.id as string]))

    const ranked = await ctx.step.run('rerank-apify-jobs', async () => {
      return rerankJobs(parsedResume, jobs, resume.raw_text ?? undefined)
    })

    const jobMap = new Map(jobs.map((j) => [`${j.source}:${j.externalId}`, j]))
    const rows = ranked.slice(0, 12)
      .map((r) => {
        const job = jobMap.get(`${r.source}:${r.externalId}`)
        if (!job) return null
        const jobId = extToDbId.get(`${job.source}:${job.externalId}`)
        if (!jobId) return null
        return {
          user_id:          userId,
          job_id:           jobId,
          similarity_score: r.score / 100,
          ai_score:         r.score,
          ai_reasoning:     JSON.stringify({ r: r.reasoning, bridge: r.bridge_advice ?? '', ms: r.matched_skills ?? [], miss: r.missing_skills ?? [] }),
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    if (!rows.length) return { added: 0, reason: 'no-ranked-rows' }

    await ctx.step.run('save-expanded-matches', async () => {
      const admin = createAdminClient()
      const { error } = await admin
        .from('job_matches')
        .upsert(rows, { onConflict: 'user_id,job_id' })
      if (error) throw new Error(`Failed to save expanded matches: ${error.message}`)
    })

    return { added: rows.length }
  }
)
