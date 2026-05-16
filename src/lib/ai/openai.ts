import OpenAI from 'openai'
import { logAiEvent } from './usage-logger'

type UsageMeta = {
  feature: string
  userId?: string
  userEmail?: string | null
  isFreeUser?: boolean
  creditsCharged?: number
  creditFeatureKey?: string
  cacheHit?: boolean
  fallbackUsed?: boolean
  fallbackReason?: string | null
  searchRunId?: string | null
  resumeId?: string | null
  jobId?: string | null
  companyName?: string | null
  metadata?: Record<string, unknown>
}

type OpenAIUsage = {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  prompt_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
}

function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured')
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function readUsage(response: unknown) {
  const usage = (response as { usage?: OpenAIUsage })?.usage
  const inputTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.total_tokens ?? 0
  const outputTokens = usage?.output_tokens ?? 0
  const cachedInputTokens = usage?.input_tokens_details?.cached_tokens ?? 0
  return { inputTokens, outputTokens, cachedInputTokens }
}

function logOpenAIResponse(model: string, meta: UsageMeta, response: unknown, provider: 'openai' | 'embedding' = 'openai') {
  const { inputTokens, outputTokens, cachedInputTokens } = readUsage(response)
  logAiEvent({
    task: meta.feature,
    provider,
    model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    userId: meta.userId,
    userEmail: meta.userEmail,
    isFreeUser: meta.isFreeUser,
    creditsCharged: meta.creditsCharged,
    creditFeatureKey: meta.creditFeatureKey,
    cacheHit: meta.cacheHit,
    fallbackUsed: meta.fallbackUsed,
    fallbackReason: meta.fallbackReason,
    searchRunId: meta.searchRunId,
    resumeId: meta.resumeId,
    jobId: meta.jobId,
    companyName: meta.companyName,
    metadata: meta.metadata,
  })
}

function logOpenAIError(model: string, meta: UsageMeta, error: unknown, provider: 'openai' | 'embedding' = 'openai') {
  const errorCode = error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160)
  logAiEvent({
    task: meta.feature,
    provider,
    model,
    inputTokens: 0,
    outputTokens: 0,
    userId: meta.userId,
    userEmail: meta.userEmail,
    isFreeUser: meta.isFreeUser,
    creditsCharged: 0,
    creditFeatureKey: meta.creditFeatureKey,
    success: false,
    errorCode,
    cacheHit: meta.cacheHit,
    fallbackUsed: meta.fallbackUsed,
    fallbackReason: meta.fallbackReason,
    searchRunId: meta.searchRunId,
    resumeId: meta.resumeId,
    jobId: meta.jobId,
    companyName: meta.companyName,
    metadata: meta.metadata,
  })
}

export async function openAIResponsesParse<T = unknown>(params: Record<string, unknown>, meta: UsageMeta): Promise<T> {
  const model = String(params.model ?? 'unknown')
  try {
    const response = await getClient().responses.parse(params as never)
    logOpenAIResponse(model, meta, response)
    return response as T
  } catch (error) {
    logOpenAIError(model, meta, error)
    throw error
  }
}

export async function openAIResponsesCreate<T = unknown>(params: Record<string, unknown>, meta: UsageMeta): Promise<T> {
  const model = String(params.model ?? 'unknown')
  try {
    const response = await getClient().responses.create(params as never)
    logOpenAIResponse(model, meta, response)
    return response as T
  } catch (error) {
    logOpenAIError(model, meta, error)
    throw error
  }
}

export async function openAIEmbeddingsCreate<T = unknown>(params: Record<string, unknown>, meta: UsageMeta): Promise<T> {
  const model = String(params.model ?? 'unknown')
  try {
    const response = await getClient().embeddings.create(params as never)
    logOpenAIResponse(model, meta, response, 'embedding')
    return response as T
  } catch (error) {
    logOpenAIError(model, meta, error, 'embedding')
    throw error
  }
}
