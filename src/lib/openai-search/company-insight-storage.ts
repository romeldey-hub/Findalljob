import type { SupabaseClient } from '@supabase/supabase-js'

export const OPENAI_V2_COMPANY_INSIGHTS_BUCKET = 'openai-v2-company-insights'

export type OpenAIV2CompanyInsightPayload = {
  resultId: string
  userId: string
  searchRunId: string
  insight: {
    company_name: string
    website: string | null
    overview: string
    industry: string | null
    headquarters: string | null
    company_size: string | null
    founded_year: string | null
    ownership_or_parent?: string | null
    products_services: string[]
    key_markets?: string[]
    india_presence?: string | null
    careers_hiring_context?: string | null
    recent_relevant_news?: string[]
    hiring_relevance: string
    why_relevant: string[]
    interview_prep: string[]
    sources: Array<{ title: string; url: string; type: string }>
    official_website_confidence?: 'high' | 'medium' | 'low'
    crawl_content_confidence?: 'high' | 'medium' | 'low'
    limited_access_note?: string | null
    confidence: 'high' | 'medium' | 'low'
    low_confidence_note: string | null
  }
  createdAt: string
  updatedAt: string
}

export function openAIV2CompanyInsightPath(userId: string, resultId: string) {
  return `${userId}/${resultId}.json`
}

function normalizeCachePart(value: string) {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function openAIV2CompanyDomainInsightPath(userId: string, company: string, officialWebsite: string) {
  const domain = new URL(officialWebsite).hostname
  return `${userId}/company-domain/${normalizeCachePart(company)}__${normalizeCachePart(domain)}.json`
}

export async function ensureOpenAIV2CompanyInsightsBucket(admin: SupabaseClient) {
  const { data: buckets, error } = await admin.storage.listBuckets()
  if (error) throw new Error(error.message)
  if (buckets?.some((bucket) => bucket.name === OPENAI_V2_COMPANY_INSIGHTS_BUCKET)) return

  const { error: createError } = await admin.storage.createBucket(OPENAI_V2_COMPANY_INSIGHTS_BUCKET, {
    public: false,
  })
  if (createError) throw new Error(createError.message)
}

export async function readOpenAIV2CompanyInsight(admin: SupabaseClient, userId: string, resultId: string) {
  const { data, error } = await admin.storage
    .from(OPENAI_V2_COMPANY_INSIGHTS_BUCKET)
    .download(openAIV2CompanyInsightPath(userId, resultId))

  if (error || !data) return null

  const payload = JSON.parse(await data.text()) as OpenAIV2CompanyInsightPayload
  if (payload.userId !== userId || payload.resultId !== resultId) return null
  return payload
}

export async function readOpenAIV2CompanyDomainInsight(
  admin: SupabaseClient,
  userId: string,
  company: string,
  officialWebsite: string,
) {
  try {
    const { data, error } = await admin.storage
      .from(OPENAI_V2_COMPANY_INSIGHTS_BUCKET)
      .download(openAIV2CompanyDomainInsightPath(userId, company, officialWebsite))

    if (error || !data) return null

    const payload = JSON.parse(await data.text()) as OpenAIV2CompanyInsightPayload
    if (payload.userId !== userId) return null
    return payload
  } catch {
    return null
  }
}

export async function saveOpenAIV2CompanyInsight(
  admin: SupabaseClient,
  payload: OpenAIV2CompanyInsightPayload,
) {
  await ensureOpenAIV2CompanyInsightsBucket(admin)

  const { error } = await admin.storage
    .from(OPENAI_V2_COMPANY_INSIGHTS_BUCKET)
    .upload(
      openAIV2CompanyInsightPath(payload.userId, payload.resultId),
      Buffer.from(JSON.stringify(payload)),
      { contentType: 'application/json', upsert: true },
    )

  if (error) throw new Error(error.message)
}

export async function saveOpenAIV2CompanyDomainInsight(
  admin: SupabaseClient,
  payload: OpenAIV2CompanyInsightPayload,
  cacheCompanyName = payload.insight.company_name,
) {
  if (!payload.insight.website) return
  await ensureOpenAIV2CompanyInsightsBucket(admin)

  const { error } = await admin.storage
    .from(OPENAI_V2_COMPANY_INSIGHTS_BUCKET)
    .upload(
      openAIV2CompanyDomainInsightPath(payload.userId, cacheCompanyName, payload.insight.website),
      Buffer.from(JSON.stringify(payload)),
      { contentType: 'application/json', upsert: true },
    )

  if (error) throw new Error(error.message)
}
