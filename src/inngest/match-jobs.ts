import { inngest } from './client'
import { generateEmbedding, generateEmbeddingsBatch, resumeToEmbeddingText } from '@/lib/ai/embeddings'
import { rerankJobs } from '@/lib/ai/reranker'
import { createAdminClient } from '@/lib/supabase/server'
import type { NormalizedJob, ParsedResume } from '@/types'

type StepRun = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }
type MatchJobsEvent = { data: { userId: string; jobs: NormalizedJob[] } }

export const matchJobsJob = inngest.createFunction(
  {
    id: 'match-jobs',
    name: 'Match Jobs to Resume',
    retries: 2,
    triggers: [{ event: 'jobs/search-complete' }],
  },
  async (ctx: { event: MatchJobsEvent; step: StepRun }) => {
    const { event, step } = ctx
    const { userId, jobs } = event.data

    const resume = await step.run('fetch-resume', async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('resumes')
        .select('id, parsed_data, raw_text')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (error) throw new Error(`No active resume: ${error.message}`)
      return data
    })

    const parsedResume = resume.parsed_data as ParsedResume

    const resumeEmbedding = await step.run('resume-embedding', async () => {
      const text = resumeToEmbeddingText(parsedResume)
      return generateEmbedding(text)
    })

    await step.run('store-jobs', async () => {
      const supabase = createAdminClient()
      const jobTexts = jobs.map((j) => `${j.title} at ${j.company}\n${j.description}`)
      const embeddings = await generateEmbeddingsBatch(jobTexts)

      const jobsToInsert = jobs.map((job, i) => ({
        external_id: job.externalId,
        source: job.source,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        url: job.url,
        requirements: {},
        embedding: embeddings[i],
        scraped_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('jobs')
        .upsert(jobsToInsert, { onConflict: 'external_id,source' })

      if (error) throw new Error(`Failed to store jobs: ${error.message}`)
    })

    const similarJobs = await step.run('similarity-search', async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase.rpc('match_jobs', {
        query_embedding: resumeEmbedding,
        match_count: 30,
        min_score: 0.4,
      })
      if (error) throw new Error(`Similarity search failed: ${error.message}`)
      return data as Array<{ id: string; similarity: number }>
    })

    if (!similarJobs.length) return { success: true, matchCount: 0 }

    const topJobDetails = await step.run('fetch-top-jobs', async () => {
      const supabase = createAdminClient()
      const jobIds = similarJobs.slice(0, 30).map((j) => j.id)
      const { data, error } = await supabase.from('jobs').select('*').in('id', jobIds)
      if (error) throw new Error(`Failed to fetch job details: ${error.message}`)
      return data as Array<Record<string, unknown>>
    })

    const reranked = await step.run('claude-rerank', async () => {
      const jobsForReranking: NormalizedJob[] = topJobDetails.map((j) => ({
        externalId: String(j.id),
        source: j.source as NormalizedJob['source'],
        title: String(j.title),
        company: String(j.company),
        location: String(j.location),
        description: String(j.description),
        url: String(j.url),
      }))
      return rerankJobs(parsedResume, jobsForReranking)
    })

    await step.run('save-matches', async () => {
      const supabase = createAdminClient()
      const similarityMap = new Map(similarJobs.map((j) => [j.id, j.similarity]))

      const matchesToInsert = reranked.slice(0, 20).map((r) => ({
        user_id: userId,
        job_id: r.externalId,
        similarity_score: similarityMap.get(r.externalId) ?? 0,
        ai_score: r.score,
        ai_reasoning: r.reasoning,
      }))

      const { error } = await supabase
        .from('job_matches')
        .upsert(matchesToInsert, { onConflict: 'user_id,job_id' })

      if (error) throw new Error(`Failed to save matches: ${error.message}`)
    })

    return { success: true, matchCount: reranked.length }
  }
)
