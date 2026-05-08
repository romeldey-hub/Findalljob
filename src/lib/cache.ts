import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedJob } from '@/types'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

const JOB_SEARCH_TTL_HOURS = 3

export function hashSearchParams(queries: string[], location: string): string {
  const key = [...queries].sort().join('|') + '::' + location.toLowerCase().trim()
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)
}

export async function getJobSearchCache(
  admin: SupabaseClient,
  userId: string,
  queryHash: string,
): Promise<NormalizedJob[] | null> {
  const ttlCutoff = new Date(Date.now() - JOB_SEARCH_TTL_HOURS * 60 * 60 * 1000).toISOString()
  const { data } = await admin
    .from('job_search_cache')
    .select('job_data')
    .eq('user_id', userId)
    .eq('query_hash', queryHash)
    .gte('created_at', ttlCutoff)
    .maybeSingle()
  if (!data?.job_data) return null
  return data.job_data as NormalizedJob[]
}

export async function setJobSearchCache(
  admin: SupabaseClient,
  userId: string,
  queryHash: string,
  jobs: NormalizedJob[],
): Promise<void> {
  await admin
    .from('job_search_cache')
    .upsert({ user_id: userId, query_hash: queryHash, job_data: jobs, created_at: new Date().toISOString() })
}

export async function getOptimizedResumeCache(
  admin: SupabaseClient,
  userId: string,
  jobId: string,
  resumeId: string,
): Promise<OptimizedResumeData | null> {
  const { data } = await admin
    .from('optimized_resumes')
    .select('optimized_text')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .eq('base_resume_id', resumeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.optimized_text) return null
  try {
    return JSON.parse(data.optimized_text) as OptimizedResumeData
  } catch {
    return null
  }
}
