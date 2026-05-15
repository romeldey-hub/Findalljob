import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  collectCompanySources,
  hasReliableCompanySourceDocs,
  isBlockedCompanyWebsiteUrl,
  isLikelyOfficialCompanyWebsiteUrl,
  resumeContext,
  summarizeCompanyInsightWithOpenAI,
  unverifiedCompanyInsight,
} from '@/lib/openai-search/company-insight'
import {
  readOpenAIV2CompanyDomainInsight,
  readOpenAIV2CompanyInsight,
  saveOpenAIV2CompanyDomainInsight,
  saveOpenAIV2CompanyInsight,
  type OpenAIV2CompanyInsightPayload,
} from '@/lib/openai-search/company-insight-storage'
import type { ParsedResume } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 90

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'string' ? item : String(item))).filter(Boolean)
}

function readCompanyWebsite(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const record = snapshot as Record<string, unknown>
  const candidates = [
    record.company_website,
    record.companyWebsite,
    record.website,
    record.company_url,
  ]
  return candidates.find((value): value is string =>
    typeof value === 'string' &&
    value.startsWith('http') &&
    !isBlockedCompanyWebsiteUrl(value)
  ) ?? null
}

function hasReliableCompanySource(insight: OpenAIV2CompanyInsightPayload['insight'], company: string) {
  return insight.sources.some((source) =>
    (source.type === 'official_website' &&
      !isBlockedCompanyWebsiteUrl(source.url) &&
      isLikelyOfficialCompanyWebsiteUrl(source.url, company)) ||
    source.type === 'trusted_company_profile' ||
    source.type === 'wikipedia_fallback'
  )
}

function primaryOfficialWebsite(insight: OpenAIV2CompanyInsightPayload['insight'], company: string) {
  const sourceUrl = insight.sources.find((source) =>
    source.type === 'official_website' &&
    source.url.startsWith('http') &&
    !isBlockedCompanyWebsiteUrl(source.url) &&
    isLikelyOfficialCompanyWebsiteUrl(source.url, company)
  )?.url
  if (!sourceUrl) return null
  try {
    return `${new URL(sourceUrl).origin}/`
  } catch {
    return sourceUrl
  }
}

function primaryOfficialWebsiteFromSources(sources: Array<{ type: string; url: string }>) {
  const sourceUrl = sources.find((source) =>
    source.type === 'official_website' &&
    source.url.startsWith('http') &&
    !isBlockedCompanyWebsiteUrl(source.url)
  )?.url
  if (!sourceUrl) return null
  try {
    return `${new URL(sourceUrl).origin}/`
  } catch {
    return sourceUrl
  }
}

function enforceOfficialWebsite(insight: OpenAIV2CompanyInsightPayload['insight'], company: string) {
  const officialWebsite = primaryOfficialWebsite(insight, company)
  if (!officialWebsite) {
    return {
      ...insight,
      website: isBlockedCompanyWebsiteUrl(insight.website) ? null : insight.website,
    }
  }
  const officialSourceCount = insight.sources.filter((source) =>
    source.type === 'official_website' &&
    isLikelyOfficialCompanyWebsiteUrl(source.url, company)
  ).length
  const crawlWasLimited = officialSourceCount <= 1
  const limitedAccessNote = crawlWasLimited
    ? 'Official website found, but direct page access was limited. Some details are based on trusted public sources.'
    : insight.limited_access_note ?? null
  return {
    ...insight,
    website: officialWebsite,
    official_website_confidence: insight.official_website_confidence === 'low' ? 'medium' as const : insight.official_website_confidence ?? 'medium' as const,
    crawl_content_confidence: crawlWasLimited ? 'low' as const : insight.crawl_content_confidence ?? 'medium' as const,
    limited_access_note: limitedAccessNote,
    confidence: insight.confidence === 'low' ? 'medium' as const : insight.confidence,
    low_confidence_note: null,
  }
}

function insightResponse(insight: OpenAIV2CompanyInsightPayload['insight'], fromCache: boolean, company: string) {
  const normalizedInsight = enforceOfficialWebsite(insight, company)
  return NextResponse.json({
    insight: normalizedInsight,
    fromCache,
    confidence: normalizedInsight.confidence,
    officialWebsite: normalizedInsight.website,
    industry: normalizedInsight.industry,
    headquarters: normalizedInsight.headquarters,
    companySize: normalizedInsight.company_size,
    founded: normalizedInsight.founded_year,
    ownershipOrParent: normalizedInsight.ownership_or_parent,
    overview: normalizedInsight.overview,
    productsServices: normalizedInsight.products_services,
    keyMarkets: normalizedInsight.key_markets,
    indiaPresence: normalizedInsight.india_presence,
    careersHiringContext: normalizedInsight.careers_hiring_context,
    recentRelevantNews: normalizedInsight.recent_relevant_news,
    officialWebsiteConfidence: normalizedInsight.official_website_confidence,
    crawlContentConfidence: normalizedInsight.crawl_content_confidence,
    limitedAccessNote: normalizedInsight.limited_access_note,
    roleFit: normalizedInsight.why_relevant,
    interviewPrep: normalizedInsight.interview_prep,
    sources: normalizedInsight.sources,
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    resultId?: string
    company?: string
    title?: string
    location?: string
    description?: string
    apply_url?: string | null
    applyUrl?: string | null
    source?: string
  }
  const resultId = body.resultId

  const admin = createAdminClient()
  const cached = resultId ? await readOpenAIV2CompanyInsight(admin, user.id, resultId) : null

  const [{ data: dbJob, error: jobError }, { data: resume }] = await Promise.all([
    resultId
      ? admin
        .from('openai_search_results')
        .select('id, search_run_id, title, company, location, source, description, apply_url, final_score, match_reasons, missing_skills, resume_fix_suggestions, job_snapshot')
        .eq('id', resultId)
        .eq('user_id', user.id)
        .single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('resumes')
      .select('parsed_data')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (resultId && (jobError || !dbJob)) return NextResponse.json({ error: 'OpenAI V2 job not found' }, { status: 404 })

  const job = dbJob ?? {
    id: null,
    search_run_id: '',
    title: body.title ?? '',
    company: body.company ?? '',
    location: body.location ?? '',
    source: body.source ?? '',
    description: body.description ?? '',
    apply_url: body.apply_url ?? body.applyUrl ?? null,
    final_score: 0,
    match_reasons: [],
    missing_skills: [],
    resume_fix_suggestions: [],
    job_snapshot: {},
  }

  if (!job.company || !job.title) {
    return NextResponse.json({ error: 'company and title are required' }, { status: 400 })
  }

  if (
    cached &&
    cached.insight.confidence !== 'low' &&
    hasReliableCompanySource(cached.insight, job.company) &&
    !isBlockedCompanyWebsiteUrl(cached.insight.website) &&
    (!cached.insight.website || isLikelyOfficialCompanyWebsiteUrl(cached.insight.website, job.company))
  ) {
    return insightResponse(cached.insight, true, job.company)
  }

  try {
    const sourceDocs = await collectCompanySources({
      company: job.company,
      title: job.title,
      location: job.location ?? '',
      description: job.description ?? '',
      applyUrl: job.apply_url,
      companyWebsite: readCompanyWebsite(job.job_snapshot),
    })
    const officialWebsite = primaryOfficialWebsiteFromSources(sourceDocs)
    const companyCached = officialWebsite
      ? await readOpenAIV2CompanyDomainInsight(admin, user.id, job.company, officialWebsite)
      : null
    if (
      companyCached &&
      companyCached.insight.confidence !== 'low' &&
      hasReliableCompanySource(companyCached.insight, job.company) &&
      !isBlockedCompanyWebsiteUrl(companyCached.insight.website) &&
      (!companyCached.insight.website || isLikelyOfficialCompanyWebsiteUrl(companyCached.insight.website, job.company))
    ) {
      const insight = enforceOfficialWebsite(companyCached.insight, job.company)
      if (resultId) {
        const now = new Date().toISOString()
        await saveOpenAIV2CompanyInsight(admin, {
          resultId,
          userId: user.id,
          searchRunId: job.search_run_id,
          insight,
          createdAt: now,
          updatedAt: now,
        })
      }
      return insightResponse(insight, true, job.company)
    }

    const rawInsight = hasReliableCompanySourceDocs(sourceDocs)
      ? await summarizeCompanyInsightWithOpenAI({
      company: job.company,
      jobTitle: job.title,
      location: job.location ?? '',
      source: job.source ?? '',
      applyUrl: job.apply_url ?? '',
      jobDescription: job.description ?? '',
      resume: resumeContext(resume?.parsed_data as ParsedResume | null),
      matchReasons: toStringList(job.match_reasons),
      missingSkills: toStringList(job.missing_skills),
      resumeFixSuggestions: toStringList(job.resume_fix_suggestions),
      sourceDocs,
    })
      : unverifiedCompanyInsight({ company: job.company, applyUrl: job.apply_url })
    const insight = enforceOfficialWebsite(rawInsight, job.company)

    const now = new Date().toISOString()
    const payload: OpenAIV2CompanyInsightPayload = {
      resultId: resultId ?? `company:${job.company}`,
      userId: user.id,
      searchRunId: job.search_run_id,
      insight,
      createdAt: now,
      updatedAt: now,
    }
    if (resultId) {
      const payload: OpenAIV2CompanyInsightPayload = {
        resultId,
        userId: user.id,
        searchRunId: job.search_run_id,
        insight,
        createdAt: now,
        updatedAt: now,
      }
      await saveOpenAIV2CompanyInsight(admin, payload)
    }
    await saveOpenAIV2CompanyDomainInsight(admin, payload, job.company)

    return insightResponse(insight, false, job.company)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not fetch company details'
    console.error('[openai-search/company-insight]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
