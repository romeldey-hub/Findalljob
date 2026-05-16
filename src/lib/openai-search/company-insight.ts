import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'
import type { ParsedResume } from '@/types'
import { openAIResponsesParse } from '@/lib/ai/openai'

const COMPANY_MODEL =
  process.env.OPENAI_COMPANY_INSIGHT_MODEL ??
  process.env.OPENAI_SEARCH_MODEL ??
  'gpt-5.2'

const BOT_UA = 'Mozilla/5.0 (compatible; FindAllJobBot/1.0; +https://www.findalljob.com/bot)'

const JOB_BOARD_DOMAINS = new Set([
  'indeed.com', 'glassdoor.com', 'google.com', 'bing.com',
  'greenhouse.io', 'lever.co', 'workable.com', 'adzuna.com', 'adzuna.co.in', 'adzuna.in',
  'himalayas.app', 'jobicy.com', 'remoteok.com', 'arbeitnow.com',
  'naukri.com', 'apna.co', 'simplyhired.com', 'ziprecruiter.com',
  'monster.com', 'careerbuilder.com', 'dice.com', 'jsearch.io',
  'foundit.in', 'foundit.com',
])

const TRUSTED_COMPANY_SOURCE_DOMAINS = new Set([
  'linkedin.com', 'crunchbase.com', 'wellfound.com', 'angel.co',
  'theorg.com', 'craft.co', 'tracxn.com', 'pitchbook.com',
])

const WIKIPEDIA_DOMAINS = new Set([
  'wikipedia.org', 'wikimedia.org',
])

const KNOWN_COMPANY_WEBSITE_HINTS: Record<string, { domain: string; url: string; identity?: string }> = {
  arrow: {
    domain: 'arrow.com',
    url: 'https://www.arrow.com/',
    identity: 'Arrow Electronics',
  },
  arrowelectronics: {
    domain: 'arrow.com',
    url: 'https://www.arrow.com/',
    identity: 'Arrow Electronics',
  },
  arrowcomponents: {
    domain: 'arrow.com',
    url: 'https://www.arrow.com/',
    identity: 'Arrow Electronics',
  },
  agilenttechnologies: {
    domain: 'agilent.com',
    url: 'https://www.agilent.com/',
    identity: 'Agilent Technologies',
  },
  agilent: {
    domain: 'agilent.com',
    url: 'https://www.agilent.com/',
    identity: 'Agilent Technologies',
  },
  shobizexperiential: {
    domain: 'shobizexperience.com',
    url: 'https://www.shobizexperience.com',
    identity: 'Shobiz Experiential Communications',
  },
  shobiz: {
    domain: 'shobizexperience.com',
    url: 'https://www.shobizexperience.com',
    identity: 'Shobiz Experiential Communications',
  },
  nvidia: {
    domain: 'nvidia.com',
    url: 'https://www.nvidia.com/',
    identity: 'NVIDIA',
  },
  weka: {
    domain: 'weka.io',
    url: 'https://www.weka.io/',
    identity: 'WEKA',
  },
  microsoft: {
    domain: 'microsoft.com',
    url: 'https://www.microsoft.com/',
    identity: 'Microsoft',
  },
  accenture: {
    domain: 'accenture.com',
    url: 'https://www.accenture.com/',
    identity: 'Accenture',
  },
}

const CompanyInsightSchema = z.object({
  company_name: z.string(),
  website: z.string().nullable(),
  overview: z.string(),
  industry: z.string().nullable(),
  headquarters: z.string().nullable(),
  company_size: z.string().nullable(),
  founded_year: z.string().nullable(),
  ownership_or_parent: z.string().nullable(),
  products_services: z.array(z.string()).max(8),
  key_markets: z.array(z.string()).max(6),
  india_presence: z.string().nullable(),
  careers_hiring_context: z.string().nullable(),
  recent_relevant_news: z.array(z.string()).max(3),
  hiring_relevance: z.string(),
  why_relevant: z.array(z.string()).max(3),
  interview_prep: z.array(z.string()).max(3),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string(),
    type: z.string(),
  }).strict()).max(8),
  official_website_confidence: z.enum(['high', 'medium', 'low']),
  crawl_content_confidence: z.enum(['high', 'medium', 'low']),
  limited_access_note: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  low_confidence_note: z.string().nullable(),
}).strict()

export type OpenAIV2CompanyInsight = z.infer<typeof CompanyInsightSchema>

type SourceDoc = {
  title: string
  url: string
  type: string
  text: string
}

type CompanyDomainDiscovery = {
  domain: string
  url: string
  source: string
  confidence: number
}

type WebSearchResult = {
  title: string
  url: string
  snippet: string
  summary?: string
  provider: string
}

function isAggregator(hostname: string) {
  const host = hostname.replace(/^www\./, '').toLowerCase()
  return JOB_BOARD_DOMAINS.has(host) || [...JOB_BOARD_DOMAINS].some((domain) => host.endsWith(`.${domain}`))
}

export function isBlockedCompanyWebsiteUrl(url?: string | null) {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    const path = parsed.pathname.toLowerCase()
    if (isAggregator(host)) return true
    if ((host === 'linkedin.com' || host.endsWith('.linkedin.com')) && path.startsWith('/jobs')) return true
    return false
  } catch {
    return false
  }
}

function isTrustedCompanySource(hostname: string) {
  const host = hostname.replace(/^www\./, '').toLowerCase()
  return TRUSTED_COMPANY_SOURCE_DOMAINS.has(host) || [...TRUSTED_COMPANY_SOURCE_DOMAINS].some((domain) => host.endsWith(`.${domain}`))
}

function isWikipedia(hostname: string) {
  const host = hostname.replace(/^www\./, '').toLowerCase()
  return WIKIPEDIA_DOMAINS.has(host) || [...WIKIPEDIA_DOMAINS].some((domain) => host.endsWith(`.${domain}`))
}

function safeHostname(url?: string | null) {
  if (!url) return null
  try {
    if (isBlockedCompanyWebsiteUrl(url)) return null
    const { hostname } = new URL(url)
    if (isTrustedCompanySource(hostname)) return null
    if (isWikipedia(hostname)) return null
    return hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function hostnameFromUrl(url?: string | null) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function canonicalRootUrl(url: string) {
  const parsed = new URL(url)
  return `${parsed.protocol}//${parsed.hostname}/`
}

function resultToSearchCandidate(result: WebSearchResult, company: string, title: string, description: string): SearchCandidate | null {
  const host = hostnameFromUrl(result.url)
  if (!host) return null
  const isBoard = isBlockedCompanyWebsiteUrl(result.url)
  const trusted = isTrustedCompanySource(host)
  const wiki = isWikipedia(host)
  const official = !isBoard && !trusted && !wiki && isLikelyOfficialCompanyDomain(host, company)
  const type = official
    ? 'official_website'
    : isBoard
      ? 'job_board'
      : trusted || (!wiki && !isBoard)
        ? 'trusted_company_profile'
        : wiki
          ? 'wikipedia_fallback'
          : 'job_board'
  const combined = `${host} ${result.title} ${result.snippet} ${result.summary ?? ''}`.toLowerCase()
  const companyTerms = company.toLowerCase().split(/\s+/).filter((part) => part.length > 2)
  const companyScore = companyTerms.filter((part) => combined.includes(part)).length * 8
  const score =
    (official ? 60 : 0) +
    (trusted ? 38 : 0) +
    (wiki ? 10 : 0) -
    (isBoard ? 120 : 0) +
    companyScore +
    (combined.includes('official') ? 10 : 0) +
    (combined.includes('career') ? 5 : 0) +
    contextKeywords(title, description).filter((keyword) => combined.includes(keyword)).length * 7

  return {
    title: result.title,
    url: result.url,
    snippet: result.summary || result.snippet,
    host,
    type,
    score,
  }
}

function decodeDuckDuckGoUrl(value: string) {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://duckduckgo.com${value}`)
    const uddg = url.searchParams.get('uddg')
    return uddg ? decodeURIComponent(uddg) : value
  } catch {
    return value
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function contextKeywords(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase()
  const keywords = [
    'semiconductor', 'fpga', 'embedded', 'electronics', 'field applications',
    'hardware', 'pcb', 'distribution', 'supply chain', 'logistics',
    'software', 'cloud', 'design', 'marketing', 'finance', 'retail',
  ]
  return keywords.filter((keyword) => text.includes(keyword))
}

export function isLikelyOfficialCompanyDomain(hostname: string, company: string) {
  const host = hostname.replace(/^www\./, '').toLowerCase()
  const normalizedCompany = company.toLowerCase().replace(/[^a-z0-9]/g, '')
  const known = KNOWN_COMPANY_WEBSITE_HINTS[normalizedCompany]
  if (known && host === known.domain) return true

  const domainLabel = host.split('.')[0].replace(/[^a-z0-9]/g, '')
  return companyToSlugs(company).some(({ slug }) =>
    slug.length >= 3 &&
    (domainLabel === slug || domainLabel.includes(slug))
  )
}

export function isLikelyOfficialCompanyWebsiteUrl(url: string | null | undefined, company: string) {
  const host = hostnameFromUrl(url)
  return Boolean(host && isLikelyOfficialCompanyDomain(host, company))
}

function contextualOfficialHint(company: string, title: string, description: string) {
  const normalizedCompany = company.toLowerCase().replace(/[^a-z0-9]/g, '')
  const keywords = contextKeywords(title, description)

  const known = KNOWN_COMPANY_WEBSITE_HINTS[normalizedCompany]
  if (known) {
    return {
      ...known,
      source: 'known_official_website_hint',
    }
  }

  if (
    normalizedCompany === 'arrow' &&
    keywords.some((keyword) => ['semiconductor', 'fpga', 'embedded', 'electronics', 'field applications', 'hardware'].includes(keyword))
  ) {
    return {
      domain: 'arrow.com',
      url: 'https://www.arrow.com/',
      source: 'contextual_official_website_hint',
      identity: 'Arrow Electronics',
    }
  }

  return null
}

function normalizeCompanySlug(company: string) {
  return company
    .toLowerCase()
    .replace(/\b(inc|corp|llc|ltd|limited|pvt|gmbh|plc|company|technologies|technology|tech|solutions|software|systems|group|holdings|global|international|services|consulting|ventures)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function companyToSlugs(name: string): Array<{ slug: string; tldHint?: string }> {
  const seen = new Set<string>()
  const result: Array<{ slug: string; tldHint?: string }> = []
  const add = (slug: string, tldHint?: string) => {
    const normalized = slug.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normalized.length < 2 || seen.has(normalized)) return
    seen.add(normalized)
    result.push({ slug: normalized, tldHint })
  }

  add(name)
  const stripped = normalizeCompanySlug(name)
  const originalWords = name.toLowerCase().match(/[a-z0-9]+/g) ?? []
  if (!(originalWords.length > 1 && stripped.length < 6)) {
    add(stripped)
  }

  const camelParts = name
    .replace(/[^a-zA-Z0-9]/g, '')
    .match(/[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\d|$)/g) ?? []
  const tldWords: Record<string, string> = { io: '.io', ai: '.ai', app: '.app', co: '.co' }
  if (camelParts.length >= 2) {
    const last = camelParts[camelParts.length - 1].toLowerCase()
    const tldHint = tldWords[last]
    if (tldHint) add(camelParts.slice(0, -1).join(''), tldHint)
  }

  const full = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const [suffix, tld] of [['io', '.io'], ['ai', '.ai'], ['app', '.app']] as const) {
    if (full.endsWith(suffix) && full.length > suffix.length + 1) {
      add(full.slice(0, -suffix.length), tld)
    }
  }

  return result
}

function extractCompanySlugFromATS(url?: string | null) {
  if (!url) return null
  try {
    const { hostname, pathname } = new URL(url)
    const host = hostname.replace(/^www\./, '')
    if (host === 'boards.greenhouse.io') return pathname.split('/').filter(Boolean)[0] ?? null
    if (host === 'jobs.lever.co') return pathname.split('/').filter(Boolean)[0] ?? null
    if (host.endsWith('.workable.com')) {
      const sub = host.split('.')[0]
      return sub === 'workable' ? null : sub
    }
  } catch {
    return null
  }
  return null
}

async function findDomainViaDuckDuckGo(company: string, contextQuery = '') {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(`${company} ${contextQuery}`.trim())}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>
    const officialSite = data.OfficialSite as string | undefined
    if (officialSite?.startsWith('http')) {
      const domain = safeHostname(officialSite)
      if (domain) return { domain, url: officialSite, source: 'official_website' }
    }

    type InfoboxEntry = { data_type: string; value: string }
    type Infobox = { content?: InfoboxEntry[] }
    const entry = (data.Infobox as Infobox | undefined)?.content?.find((item) =>
      ['official website', 'official_website', 'website'].includes(item.data_type),
    )
    if (entry?.value?.startsWith('http')) {
      const domain = safeHostname(entry.value)
      if (domain) return { domain, url: entry.value, source: 'official_website' }
    }
  } catch {
    return null
  }
  return null
}

async function searchLangSearch(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.LANGSEARCH_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.langsearch.com/v1/web-search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, freshness: 'noLimit', summary: true, count: 10 }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data = await res.json() as {
      data?: {
        webPages?: {
          value?: Array<{ name?: string; url?: string; snippet?: string; summary?: string }>
        }
      }
    }
    return (data.data?.webPages?.value ?? [])
      .filter((item): item is { name?: string; url: string; snippet?: string; summary?: string } => Boolean(item.url))
      .map((item) => ({
        title: item.name ?? item.url,
        url: item.url,
        snippet: item.snippet ?? '',
        summary: item.summary,
        provider: 'langsearch',
      }))
  } catch {
    return []
  }
}

async function searchBrave(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!apiKey) return []
  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', query)
    url.searchParams.set('count', '10')
    const res = await fetch(url, {
      headers: {
        'X-Subscription-Token': apiKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data = await res.json() as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> }
    }
    return (data.web?.results ?? [])
      .filter((item): item is { title?: string; url: string; description?: string } => Boolean(item.url))
      .map((item) => ({
        title: item.title ?? item.url,
        url: item.url,
        snippet: item.description ?? '',
        provider: 'brave',
      }))
  } catch {
    return []
  }
}

async function searchGoogleProgrammable(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY ?? process.env.GOOGLE_API_KEY
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID ?? process.env.GOOGLE_CSE_ID
  if (!apiKey || !engineId) return []
  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('cx', engineId)
    url.searchParams.set('q', query)
    url.searchParams.set('num', '10')
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = await res.json() as {
      items?: Array<{ title?: string; link?: string; snippet?: string }>
    }
    return (data.items ?? [])
      .filter((item): item is { title?: string; link: string; snippet?: string } => Boolean(item.link))
      .map((item) => ({
        title: item.title ?? item.link,
        url: item.link,
        snippet: item.snippet ?? '',
        provider: 'google_programmable',
      }))
  } catch {
    return []
  }
}

async function searchTavily(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        include_answer: false,
        max_results: 8,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data = await res.json() as {
      results?: Array<{ title?: string; url?: string; content?: string }>
    }
    return (data.results ?? [])
      .filter((item): item is { title?: string; url: string; content?: string } => Boolean(item.url))
      .map((item) => ({
        title: item.title ?? item.url,
        url: item.url,
        snippet: item.content ?? '',
        provider: 'tavily',
      }))
  } catch {
    return []
  }
}

async function searchWithProviderPriority(queries: string[], company: string, title: string, description: string) {
  const candidates: SearchCandidate[] = []
  const addResults = (results: WebSearchResult[]) => {
    for (const result of results) {
      const candidate = resultToSearchCandidate(result, company, title, description)
      if (candidate) candidates.push(candidate)
    }
  }

  for (const query of queries) addResults(await searchLangSearch(query))
  if (!candidates.some((candidate) => candidate.type === 'official_website' && candidate.score >= 45)) {
    for (const query of queries) addResults(await searchBrave(query))
  }
  if (!candidates.some((candidate) => candidate.type === 'official_website' && candidate.score >= 45)) {
    for (const query of queries) addResults(await searchGoogleProgrammable(query))
  }
  const trustedCount = candidates.filter((candidate) =>
    candidate.type === 'official_website' || candidate.type === 'trusted_company_profile'
  ).length
  if (trustedCount < 2) {
    for (const query of queries.slice(0, 2)) addResults(await searchTavily(query))
  }

  const seen = new Set<string>()
  return candidates
    .filter((candidate) => {
      if (seen.has(candidate.url)) return false
      seen.add(candidate.url)
      return true
    })
    .sort((a, b) => b.score - a.score)
}

type SearchCandidate = {
  title: string
  url: string
  snippet: string
  host: string
  type: 'official_website' | 'trusted_company_profile' | 'wikipedia_fallback' | 'job_board'
  score: number
}

async function searchCompanyCandidates({
  company,
  title,
  location,
  description,
}: {
  company: string
  title: string
  location: string
  description: string
}) {
  const keywordText = contextKeywords(title, description).join(' ')
  const queries = [
    `${company} official website company`,
    `${company} official website`,
    `${company} company website`,
    `${company} careers`,
    `${company} ${title} ${location}`,
    `${company} LinkedIn company`,
    `${company} ${title} ${location} official website ${keywordText}`,
    `${company} ${keywordText} company official website`,
    `${company} ${title} company LinkedIn Crunchbase Wellfound`,
  ].map((query) => query.replace(/\s+/g, ' ').trim())

  const candidates: SearchCandidate[] = [
    ...await searchWithProviderPriority(queries, company, title, description),
  ]

  async function searchDuckDuckGoHtml(query: string) {
    const queryCandidates: SearchCandidate[] = []
    try {
      const res = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 FindAllJobCompanyResearch/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return queryCandidates
      const html = await res.text()
      const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
      let match: RegExpExecArray | null
      while ((match = resultRegex.exec(html)) && queryCandidates.length < 5) {
        const url = decodeDuckDuckGoUrl(match[1])
        const host = hostnameFromUrl(url)
        if (!host) continue
        const isBoard = isBlockedCompanyWebsiteUrl(url)
        const trusted = isTrustedCompanySource(host)
        const wiki = isWikipedia(host)
        const official = !isBoard && !trusted && !wiki && isLikelyOfficialCompanyDomain(host, company)
        const type = official
          ? 'official_website'
          : isBoard
            ? 'job_board'
            : trusted || (!wiki && !isBoard)
            ? 'trusted_company_profile'
            : wiki
              ? 'wikipedia_fallback'
              : 'job_board'
        const combined = `${host} ${stripHtml(match[2])} ${stripHtml(match[3])}`.toLowerCase()
        const score =
          (official ? 50 : 0) +
          (trusted ? 35 : 0) +
          (wiki ? 10 : 0) -
          (isBoard ? 100 : 0) +
          (combined.includes(company.toLowerCase()) ? 15 : 0) +
          contextKeywords(title, description).filter((keyword) => combined.includes(keyword)).length * 8
        queryCandidates.push({
          title: stripHtml(match[2]),
          url,
          snippet: stripHtml(match[3]),
          host,
          type,
          score,
        })
      }
    } catch {
      return queryCandidates
    }
    return queryCandidates
  }
  const duckDuckGoResults = await Promise.all(queries.map(searchDuckDuckGoHtml))
  candidates.push(...duckDuckGoResults.flat())

  const seen = new Set<string>()
  return candidates
    .filter((candidate) => {
      if (seen.has(candidate.url)) return false
      seen.add(candidate.url)
      return true
    })
    .sort((a, b) => b.score - a.score)
}

async function inferDomain(company: string) {
  const variants = companyToSlugs(company)
  const ordered: string[] = []
  const push = (domain: string) => { if (!ordered.includes(domain)) ordered.push(domain) }

  for (const { slug, tldHint } of variants) if (!tldHint) push(`${slug}.com`)
  for (const { slug, tldHint } of variants) if (tldHint) push(`${slug}${tldHint}`)
  for (const { slug, tldHint } of variants) if (tldHint) push(`${slug}.com`)
  for (const { slug } of variants.slice(0, 2)) push(`get${slug}.com`)
  for (const tld of ['.io', '.ai', '.co', '.in']) {
    for (const { slug } of variants) push(`${slug}${tld}`)
  }

  for (const domain of ordered.slice(0, 12)) {
    const url = `https://${domain}`
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(3000),
        headers: { 'User-Agent': BOT_UA, Accept: 'text/html' },
      })
      if (res.status < 500) return { domain, url, source: 'inferred_official_website' }
    } catch {
      // Try next domain.
    }
  }
  return null
}

async function fetchPage(url: string, title: string, type: string): Promise<SourceDoc | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BOT_UA, Accept: 'text/html', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 7000)
    if (text.length < 120) return null
    return { title, url, type, text }
  } catch {
    return null
  }
}

async function fetchReaderPage(url: string, title: string, type: string): Promise<SourceDoc | null> {
  try {
    const readerUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`
    const res = await fetch(readerUrl, {
      headers: { 'User-Agent': 'FindAllJobCompanyResearch/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const text = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 7000)
    if (text.length < 120) return null
    return { title, url, type, text }
  } catch {
    return null
  }
}

export function resumeContext(parsed: ParsedResume | null) {
  if (!parsed) return 'No active resume context available.'
  return [
    parsed.summary ? `Summary: ${parsed.summary.slice(0, 500)}` : null,
    parsed.skills?.length ? `Skills: ${parsed.skills.slice(0, 16).join(', ')}` : null,
    parsed.experience?.length
      ? `Experience: ${parsed.experience.slice(0, 4).map((exp) => `${exp.title} at ${exp.company}`).join('; ')}`
      : null,
  ].filter(Boolean).join('\n') || 'No active resume context available.'
}

export async function collectCompanySources({
  company,
  title,
  location,
  description,
  applyUrl,
  companyWebsite,
}: {
  company: string
  title: string
  location: string
  description: string
  applyUrl?: string | null
  companyWebsite?: string | null
}) {
  const sources: SourceDoc[] = []
  const officialFromPayload = companyWebsite?.startsWith('http') && safeHostname(companyWebsite) ? companyWebsite : null
  const contextQuery = `${title} ${location} ${contextKeywords(title, description).join(' ')}`
  const searchCandidates = await searchCompanyCandidates({ company, title, location, description })
  const officialCandidate = searchCandidates.find((candidate) => candidate.type === 'official_website' && candidate.score > 35)
  const trustedCandidates = searchCandidates.filter((candidate) => candidate.type === 'trusted_company_profile').slice(0, 3)
  const wikipediaCandidate = searchCandidates.find((candidate) => candidate.type === 'wikipedia_fallback')
  const contextualHint = contextualOfficialHint(company, title, description)
  const atsSlug = extractCompanySlugFromATS(applyUrl)
  const atsInferred = atsSlug ? await inferDomain(atsSlug) : null
  const official =
    officialFromPayload ? { domain: safeHostname(officialFromPayload), url: officialFromPayload, source: 'official_website' } :
    contextualHint ? contextualHint :
    officialCandidate ? { domain: officialCandidate.host, url: officialCandidate.url, source: 'official_search_result' } :
    atsInferred ? atsInferred :
    await findDomainViaDuckDuckGo(company, contextQuery) ??
    await inferDomain(company)

  if (official?.url) {
    const root = official.url.replace(/\/$/, '')
    const officialPages = [
      { url: root, title: 'Official website' },
      { url: `${root}/about`, title: 'Official about page' },
      { url: `${root}/about-us`, title: 'Official about page' },
      { url: `${root}/company`, title: 'Official company page' },
      { url: `${root}/products`, title: 'Official products page' },
      { url: `${root}/solutions`, title: 'Official solutions page' },
      { url: `${root}/careers`, title: 'Official careers page' },
      { url: `${root}/contact`, title: 'Official contact page' },
      { url: `${root}/locations`, title: 'Official locations page' },
      { url: `${root}/news`, title: 'Official news page' },
    ]
    const pages = await Promise.all(
      officialPages.map((page) => fetchPage(page.url, page.title, 'official_website')),
    )
    for (const page of pages) if (page) sources.push(page)
    if (sources.length === 0) {
      const readerPage = await fetchReaderPage(root, 'Official website', 'official_website')
      if (readerPage) sources.push(readerPage)
    }
    if (sources.length === 0) {
      sources.push({
        title: 'Official website',
        url: root,
        type: 'official_website',
        text: [
          `Official company website identified for ${company}.`,
          official.source === 'contextual_official_website_hint'
            ? `Context disambiguation indicates ${company} refers to ${(official as { identity?: string }).identity ?? company} because the role mentions semiconductor/electronics field applications work.`
            : `Official domain identified from ${official.source}.`,
          'Direct page access was limited, but the official website URL itself is confidently identified. Do not mark the company website as unavailable because of crawling failure. Use trusted search snippets and company profiles for other facts, and omit unsupported details.',
        ].join('\n'),
      })
    }
  }

  for (const candidate of trustedCandidates) {
    sources.push({
      title: candidate.title,
      url: candidate.url,
      type: candidate.type,
      text: candidate.snippet || `Trusted company profile for ${company}.`,
    })
  }

  if (sources.length === 0 && wikipediaCandidate) {
    sources.push({
      title: wikipediaCandidate.title,
      url: wikipediaCandidate.url,
      type: wikipediaCandidate.type,
      text: wikipediaCandidate.snippet || `Wikipedia fallback for ${company}.`,
    })
  }

  if (sources.length === 0) {
    sources.push({
      title: 'Job listing context',
      url: applyUrl ?? '',
      type: 'job_listing',
      text: [
        'No official company website or trusted company profile could be confidently fetched.',
        'Use job listing context only and mark unavailable facts clearly.',
        `Job title: ${title}`,
        `Location: ${location}`,
        `Description excerpt: ${description.slice(0, 900)}`,
      ].join('\n'),
    })
  }

  return sources
}

export function hasReliableCompanySourceDocs(sourceDocs: SourceDoc[]) {
  return sourceDocs.some((source) =>
    (source.type === 'official_website' && !isBlockedCompanyWebsiteUrl(source.url)) ||
    source.type === 'trusted_company_profile' ||
    source.type === 'wikipedia_fallback'
  )
}

export function unverifiedCompanyInsight({
  company,
  applyUrl,
}: {
  company: string
  applyUrl?: string | null
}): OpenAIV2CompanyInsight {
  return {
    company_name: company,
    website: null,
    overview: 'Could not verify company details from reliable company sources.',
    industry: null,
    headquarters: null,
    company_size: null,
    founded_year: null,
    ownership_or_parent: null,
    products_services: [],
    key_markets: [],
    india_presence: null,
    careers_hiring_context: null,
    recent_relevant_news: [],
    hiring_relevance: 'Could not verify company details from reliable company sources.',
    why_relevant: [],
    interview_prep: [
      'Verify the employer website independently before applying.',
      'Use the job description to prepare role-specific examples.',
      'Ask the recruiter to confirm company details, team structure, and reporting line.',
    ],
    sources: applyUrl ? [{ title: 'Job listing source', url: applyUrl, type: 'job_listing' }] : [],
    official_website_confidence: 'low',
    crawl_content_confidence: 'low',
    limited_access_note: null,
    confidence: 'low',
    low_confidence_note: 'Could not verify company details from reliable company sources.',
  }
}

export async function summarizeCompanyInsightWithOpenAI({
  company,
  jobTitle,
  location,
  source,
  applyUrl,
  jobDescription,
  resume,
  matchReasons,
  missingSkills,
  resumeFixSuggestions,
  sourceDocs,
  usage,
}: {
  company: string
  jobTitle: string
  location: string
  source: string
  applyUrl: string
  jobDescription: string
  resume: string
  matchReasons: string[]
  missingSkills: string[]
  resumeFixSuggestions: string[]
  sourceDocs: SourceDoc[]
  usage?: {
    userId?: string
    userEmail?: string | null
    isFreeUser?: boolean
    searchRunId?: string | null
    jobId?: string | null
  }
}) {
  const response = await openAIResponsesParse<{ output_parsed?: OpenAIV2CompanyInsight }>({
    model: COMPANY_MODEL,
    instructions: [
      'Summarize company information for a job seeker using only the supplied sources and job context.',
      'Prefer official website data, then trusted company profiles, then Wikipedia only as a last fallback. Job board pages are not company authority.',
      'Do not invent company size, funding, founders, clients, revenue, headquarters, or founded year.',
      'If a detail is unavailable or ambiguous, return null for nullable fields and [] for arrays. Do not write placeholder phrases like "Not confidently available" into content fields.',
      'Separate official website confidence from crawl content confidence. If an official website URL is confidently identified but page crawling was blocked or sparse, keep official_website_confidence high or medium and set crawl_content_confidence low.',
      'A 403, bot block, or fetch failure must not by itself make the official website or whole company low confidence.',
      'When direct official page access is limited but the official website is known, set limited_access_note to "Official website found, but direct page access was limited. Some details are based on trusted public sources."',
      'Include products/services, key markets, India presence, ownership/parent company, hiring context, and recent relevant news only when directly supported by supplied sources.',
      'For semiconductor and application engineering roles, extract concrete product categories and role-relevant business context when official sources support it.',
      'If at least one official_website source was fetched and it matches the company identity, confidence should be high or medium unless facts conflict.',
      'Use low confidence only when company identity is ambiguous or sources are weak/job-board-only. Explain exactly what is ambiguous.',
    ].join(' '),
    input: JSON.stringify({
      company,
      job: { title: jobTitle, location, source, applyUrl, description: jobDescription.slice(0, 1800) },
      candidate_resume_context: resume,
      match_context: {
        matchReasons,
        missingSkills,
        resumeFixSuggestions,
      },
      sources: sourceDocs.map((doc) => ({
        title: doc.title,
        url: doc.url,
        type: doc.type,
        text: doc.text.slice(0, 5000),
      })),
    }),
    text: { format: zodTextFormat(CompanyInsightSchema, 'openai_v2_company_insight') },
  }, {
    feature: 'company_insight_summary',
    userId: usage?.userId,
    userEmail: usage?.userEmail,
    isFreeUser: usage?.isFreeUser,
    creditsCharged: 0,
    creditFeatureKey: 'free_company_insight',
    searchRunId: usage?.searchRunId ?? null,
    jobId: usage?.jobId ?? null,
    companyName: company,
    metadata: { source_count: sourceDocs.length },
  })

  if (!response.output_parsed) throw new Error('OpenAI did not return a valid company insight')
  return response.output_parsed
}
