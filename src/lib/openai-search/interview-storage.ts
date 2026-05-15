import type { SupabaseClient } from '@supabase/supabase-js'

export const OPENAI_V2_INTERVIEW_PREP_BUCKET = 'openai-v2-interview-prep'

export type OpenAIV2InterviewPrepPayload = {
  resultId: string
  userId: string
  searchRunId: string
  question: string
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

export function openAIV2InterviewPrepPath(userId: string, resultId: string) {
  return `${userId}/${resultId}.json`
}

export async function ensureOpenAIV2InterviewPrepBucket(admin: SupabaseClient) {
  const { data: buckets, error } = await admin.storage.listBuckets()
  if (error) throw new Error(error.message)
  if (buckets?.some((bucket) => bucket.name === OPENAI_V2_INTERVIEW_PREP_BUCKET)) return

  const { error: createError } = await admin.storage.createBucket(OPENAI_V2_INTERVIEW_PREP_BUCKET, {
    public: false,
  })
  if (createError) throw new Error(createError.message)
}

export async function readOpenAIV2InterviewPrep(admin: SupabaseClient, userId: string, resultId: string) {
  const { data, error } = await admin.storage
    .from(OPENAI_V2_INTERVIEW_PREP_BUCKET)
    .download(openAIV2InterviewPrepPath(userId, resultId))

  if (error || !data) return null

  const payload = JSON.parse(await data.text()) as OpenAIV2InterviewPrepPayload
  if (payload.userId !== userId || payload.resultId !== resultId) return null
  return payload
}

export async function saveOpenAIV2InterviewPrep(
  admin: SupabaseClient,
  payload: OpenAIV2InterviewPrepPayload,
) {
  await ensureOpenAIV2InterviewPrepBucket(admin)

  const { error } = await admin.storage
    .from(OPENAI_V2_INTERVIEW_PREP_BUCKET)
    .upload(
      openAIV2InterviewPrepPath(payload.userId, payload.resultId),
      Buffer.from(JSON.stringify(payload)),
      { contentType: 'application/json', upsert: true },
    )

  if (error) throw new Error(error.message)
}
