import type { SupabaseClient } from '@supabase/supabase-js'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

export const OPENAI_V2_OPTIMIZED_RESUMES_BUCKET = 'openai-v2-optimized-resumes'

export type OpenAIV2OptimizedResumePayload = {
  resultId: string
  userId: string
  searchRunId: string
  optimizedData: OptimizedResumeData
  job: {
    title: string
    company: string
    location: string
    description: string
    applyUrl: string
    finalScore: number
    whyThisMatches: string[]
    missingSkills: string[]
    resumeFixSuggestions: string[]
  }
  createdAt: string
  updatedAt: string
}

export function openAIV2OptimizedResumePath(userId: string, resultId: string) {
  return `${userId}/${resultId}.json`
}

export async function ensureOpenAIV2OptimizedResumeBucket(admin: SupabaseClient) {
  const { data: buckets, error } = await admin.storage.listBuckets()
  if (error) throw new Error(error.message)
  if (buckets?.some((bucket) => bucket.name === OPENAI_V2_OPTIMIZED_RESUMES_BUCKET)) return

  const { error: createError } = await admin.storage.createBucket(OPENAI_V2_OPTIMIZED_RESUMES_BUCKET, {
    public: false,
  })
  if (createError) throw new Error(createError.message)
}

export async function readOpenAIV2OptimizedResume(
  admin: SupabaseClient,
  userId: string,
  resultId: string,
) {
  const { data, error } = await admin.storage
    .from(OPENAI_V2_OPTIMIZED_RESUMES_BUCKET)
    .download(openAIV2OptimizedResumePath(userId, resultId))

  if (error || !data) return null

  const payload = JSON.parse(await data.text()) as OpenAIV2OptimizedResumePayload
  if (payload.userId !== userId || payload.resultId !== resultId) return null
  return payload
}

export async function saveOpenAIV2OptimizedResume(
  admin: SupabaseClient,
  payload: OpenAIV2OptimizedResumePayload,
) {
  await ensureOpenAIV2OptimizedResumeBucket(admin)

  const { error } = await admin.storage
    .from(OPENAI_V2_OPTIMIZED_RESUMES_BUCKET)
    .upload(
      openAIV2OptimizedResumePath(payload.userId, payload.resultId),
      Buffer.from(JSON.stringify(payload)),
      { contentType: 'application/json', upsert: true },
    )

  if (error) throw new Error(error.message)
}
