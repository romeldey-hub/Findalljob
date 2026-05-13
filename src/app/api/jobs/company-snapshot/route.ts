/**
 * POST /api/jobs/company-snapshot
 *
 * Free for all users — no credit deduction.
 *
 * Domain discovery priority:
 *  1. Job URL (if not an aggregator domain)
 *  2. DuckDuckGo OfficialSite field  (never AbstractURL — that is Wikipedia)
 *  3. DuckDuckGo Infobox official_website entry
 *  4. Domain inference: HEAD-check {slug}.com / {slug}.io / {slug}.ai
 *  5. No domain — build from job description only
 *
 * Wikipedia is NEVER used as a source. AbstractURL is explicitly skipped.
 *
 * Pipeline:
 *  1. Auth check
 *  2. Cache hit? → return immediately (job_id → snapshot, or domain → snapshot)
 *  3. Discover domain with priority order above
 *  4. Check robots.txt
 *  5. Scrape home + about + careers pages in parallel; extract og:url for confirmed link
 *  6. Claude Haiku structures scraped text (platform cost, not charged to user)
 *  7. Upsert company_snapshots (domain-keyed), link job_company_snapshots
 *  8. Return snapshot with source_note field
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateLightJSON } from '@/lib/ai/client'

// ── Types ─────────────────────────────────────────────────────────────────────

type DomainSource = 'job_url' | 'ddg_official' | 'ddg_infobox' | 'inferred' | 'none'

interface CompanySnapshot {
  company_name:   string
  overview:       string
  industry:       string | null
  website:        string | null
  headquarters:   string | null
  company_size:   string | null
  why_relevant:   string
  interview_prep: string[]
  data_limited:   boolean
  source_note:    'official_website' | 'fallback_only'
}

interface RequestBody {
  job_id:       string
  company:      string
  title:        string
  description?: string
  location?:    string
  url?:         string
  source?:      string
}

// ── Aggregator list ───────────────────────────────────────────────────────────

const AGGREGATORS = new Set([
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'google.com', 'bing.com',
  'greenhouse.io', 'lever.co', 'workable.com', 'adzuna.com', 'adzuna.co.in',
  'himalayas.app', 'jobicy.com', 'remoteok.com', 'arbeitnow.com',
  'naukri.com', 'apna.co', 'simplyhired.com', 'ziprecruiter.com',
  'monster.com', 'careerbuilder.com', 'dice.com', 'jsearch.io',
  'wellfound.com', 'angel.co',
])

function isAggregator(hostname: string): boolean {
  const h = hostname.replace(/^www\./, '')
  return AGGREGATORS.has(h) || [...AGGREGATORS].some(a => h.endsWith('.' + a))
}

// ── Domain helpers ────────────────────────────────────────────────────────────

function domainFromUrl(url?: string): string | null {
  if (!url) return null
  try {
    const { hostname } = new URL(url)
    if (isAggregator(hostname)) return null
    return hostname.replace(/^www\./, '')
  } catch { return null }
}

/** Extract a safe hostname from a URL string. Returns null for aggregators or Wikipedia. */
function safeHostname(url: string): string | null {
  try {
    const { hostname } = new URL(url)
    if (isAggregator(hostname)) return null
    if (hostname.includes('wikipedia.org') || hostname.includes('wikimedia.org')) return null
    return hostname.replace(/^www\./, '')
  } catch { return null }
}

/**
 * DuckDuckGo Instant Answers — checks OfficialSite and Infobox only.
 * AbstractURL is NEVER used because it points to Wikipedia.
 */
async function findDomainViaDDG(company: string): Promise<{ domain: string; source: 'ddg_official' | 'ddg_infobox' } | null> {
  try {
    const q   = encodeURIComponent(company)
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>

    // 1. OfficialSite — explicit field, highest confidence
    const officialSite = data.OfficialSite as string | undefined
    if (officialSite && officialSite.startsWith('http')) {
      const domain = safeHostname(officialSite)
      if (domain) return { domain, source: 'ddg_official' }
    }

    // 2. Infobox official_website entry — structured data, still reliable
    type InfoboxEntry = { data_type: string; value: string }
    type Infobox = { content?: InfoboxEntry[] }
    const infobox = data.Infobox as Infobox | undefined
    const entry = infobox?.content?.find(c =>
      c.data_type === 'official website' ||
      c.data_type === 'official_website' ||
      c.data_type === 'website',
    )
    if (entry?.value?.startsWith('http')) {
      const domain = safeHostname(entry.value)
      if (domain) return { domain, source: 'ddg_infobox' }
    }

    // AbstractURL is intentionally NOT used — it points to Wikipedia
    return null
  } catch { return null }
}

/**
 * Normalise a company name into plausible domain slugs with TLD hints.
 *
 * Handles embedded TLD suffixes in company names:
 *   "WekaIO"   → [{slug:"wekaio"}, {slug:"weka", tldHint:".io"}]
 *   "OpenAI"   → [{slug:"openai"}, {slug:"open", tldHint:".ai"}]
 *   "Microsoft"→ [{slug:"microsoft"}]
 */
function companyToSlugs(name: string): Array<{ slug: string; tldHint?: string }> {
  const seen   = new Set<string>()
  const result: Array<{ slug: string; tldHint?: string }> = []

  const add = (slug: string, tldHint?: string) => {
    const s = slug.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (s.length < 2 || seen.has(s)) return
    seen.add(s)
    result.push({ slug: s, tldHint })
  }

  const CORP_STRIP = /\b(inc|corp|llc|ltd|limited|pvt|gmbh|plc|company|technologies|technology|tech|solutions|software|systems|group|holdings|global|international|services|consulting|ventures)\b\.?/gi

  // 1. Full normalized slug
  add(name.toLowerCase().replace(/[^a-z0-9]/g, ''))

  // 2. Strip corporate suffixes
  const stripped = name.toLowerCase().replace(CORP_STRIP, '').replace(/[^a-z0-9]/g, '').trim()
  if (stripped) add(stripped)

  // 3. CamelCase/PascalCase split — detect embedded TLD-like word at end
  //    "WekaIO" → ["Weka","IO"] → base "weka", hint ".io"
  //    "OpenAI" → ["Open","AI"] → base "open", hint ".ai"
  const camelParts = name
    .replace(/[^a-zA-Z0-9]/g, '')
    .match(/[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\d|$)/g) ?? []
  const TLD_WORDS: Record<string, string> = { io: '.io', ai: '.ai', app: '.app', co: '.co' }
  if (camelParts.length >= 2) {
    const last    = camelParts[camelParts.length - 1].toLowerCase()
    const tldHint = TLD_WORDS[last]
    if (tldHint) {
      const base = camelParts.slice(0, -1).join('').toLowerCase().replace(/[^a-z0-9]/g, '')
      add(base, tldHint)
    }
  }

  // 4. Suffix scan on full normalized slug
  //    "wekaio" ends with "io" → also add slug "weka" with hint ".io"
  const full = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const [sfx, tld] of [['io', '.io'], ['ai', '.ai'], ['app', '.app']] as const) {
    if (full.endsWith(sfx) && full.length > sfx.length + 1) {
      add(full.slice(0, -sfx.length), tld)
    }
  }

  return result
}

/**
 * Domain inference — HEAD-checks plausible domain candidates in priority order.
 * TLD-hinted variants (e.g. weka.io for WekaIO) are tried before .com fallbacks.
 * Also tries common SaaS prefix patterns: get{slug}.com.
 */
async function inferDomain(company: string): Promise<string | null> {
  const variants = companyToSlugs(company)
  const ordered: string[] = []
  const push = (d: string) => { if (!ordered.includes(d)) ordered.push(d) }

  // 1. .com for the full (non-hinted) slugs first — most reliable for known companies
  //    openai.com, wekaio.com, microsoft.com, nvidia.com
  for (const { slug, tldHint } of variants) {
    if (!tldHint) push(slug + '.com')
  }
  // 2. TLD-hinted variants — high confidence for companies with embedded TLD in name
  //    weka.io (for WekaIO), open.ai (for OpenAI) — tried AFTER openai.com for safety
  for (const { slug, tldHint } of variants) {
    if (tldHint) push(slug + tldHint)
  }
  // 3. .com for base slugs (stripped name without TLD suffix)
  for (const { slug, tldHint } of variants) {
    if (tldHint) push(slug + '.com')
  }
  // 4. get{slug}.com — common SaaS vanity pattern
  for (const { slug } of variants.slice(0, 2)) push('get' + slug + '.com')
  // 5. Remaining .io and .ai
  for (const tld of ['.io', '.ai']) {
    for (const { slug } of variants) push(slug + tld)
  }

  for (const domain of ordered.slice(0, 10)) {
    try {
      const r = await fetch(`https://${domain}`, {
        method:  'HEAD',
        signal:  AbortSignal.timeout(2500),
        headers: { 'User-Agent': BOT_UA, 'Accept': 'text/html' },
        redirect: 'follow',
      })
      if (r.status < 500) return domain
    } catch { /* try next */ }
  }
  return null
}

/**
 * For ATS-hosted job URLs (Greenhouse, Lever, Workable), extract the company
 * slug from the URL — it often matches or closely maps to the real domain.
 * e.g. boards.greenhouse.io/weka/jobs/... → "weka"
 */
function extractCompanySlugFromATS(url: string): string | null {
  if (!url) return null
  try {
    const { hostname, pathname } = new URL(url)
    const h = hostname.replace(/^www\./, '')
    if (h === 'boards.greenhouse.io') {
      return pathname.split('/').filter(Boolean)[0] ?? null
    }
    if (h === 'jobs.lever.co') {
      return pathname.split('/').filter(Boolean)[0] ?? null
    }
    if (h.endsWith('.workable.com')) {
      const sub = h.split('.')[0]
      return sub === 'workable' ? null : sub
    }
  } catch { /* ignore */ }
  return null
}

// ── robots.txt ────────────────────────────────────────────────────────────────

async function pathAllowed(domain: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${domain}/robots.txt`, {
      signal:  AbortSignal.timeout(4000),
      headers: { 'User-Agent': 'FindAllJobBot/1.0 (+https://www.findalljob.com/bot)' },
    })
    if (!res.ok) return true
    const text  = await res.text()
    let applies = false
    for (const raw of text.split('\n')) {
      const line = raw.trim().toLowerCase()
      if (line.startsWith('user-agent:')) {
        const agent = line.slice('user-agent:'.length).trim()
        applies = agent === '*'
      } else if (applies && line.startsWith('disallow:')) {
        const disallowed = line.slice('disallow:'.length).trim()
        if (disallowed && path.startsWith(disallowed)) return false
      }
    }
    return true
  } catch { return true }
}

// ── HTML → plain text ─────────────────────────────────────────────────────────

function metaContent(html: string, name: string): string | null {
  const pats = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']{8,500})["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']{8,500})["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
  ]
  for (const p of pats) {
    const m = html.match(p)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^]*?<\/script>/gi, ' ')
    .replace(/<style\b[^]*?<\/style>/gi, ' ')
    .replace(/<nav\b[^]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[^]*?<\/footer>/gi, ' ')
    .replace(/<header\b[^]*?<\/header>/gi, ' ')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Page fetcher ──────────────────────────────────────────────────────────────

const BOT_UA = 'Mozilla/5.0 (compatible; FindAllJobBot/1.0; +https://www.findalljob.com/bot)'

/** Extract og:url or <link rel="canonical"> from raw HTML — gives the confirmed official URL. */
function extractCanonicalUrl(html: string): string | null {
  const ogUrl = metaContent(html, 'og:url')
  if (ogUrl?.startsWith('http')) return ogUrl
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)
  const url = m?.[1]
  if (url?.startsWith('http')) return url
  return null
}

interface PageResult { text: string; canonicalUrl: string | null }

async function fetchPageText(url: string): Promise<PageResult | null> {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { 'User-Agent': BOT_UA, 'Accept': 'text/html', 'Accept-Language': 'en' },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return null
    const html        = await res.text()
    const meta        = metaContent(html, 'description') || metaContent(html, 'og:description') || ''
    const body        = htmlToText(html).slice(0, 3500)
    const canonicalUrl = extractCanonicalUrl(html)
    return { text: [meta && `[meta] ${meta}`, body].filter(Boolean).join('\n'), canonicalUrl }
  } catch { return null }
}

// ── Main scraper ──────────────────────────────────────────────────────────────

// Ordered by value: about/company pages carry the most factual content;
// products/solutions/careers add useful context about what the company does.
const CANDIDATE_PATHS = ['/about', '/about-us', '/company', '/about/overview', '/products', '/solutions', '/careers', '/']

interface ScrapeResult { content: string; sourceUrls: string[]; confirmedWebsite: string | null }

async function scrapeCompany(domain: string): Promise<ScrapeResult> {
  const rootOk = await pathAllowed(domain, '/')
  if (!rootOk) return { content: '', sourceUrls: [], confirmedWebsite: null }

  // Collect up to 4 allowed paths
  const paths: string[] = []
  for (const p of CANDIDATE_PATHS) {
    if (paths.length >= 4) break
    if (await pathAllowed(domain, p)) paths.push(p)
  }

  const results = await Promise.allSettled(
    paths.map(p => fetchPageText(`https://${domain}${p}`).then(r => ({ path: p, result: r }))),
  )

  const parts:      string[] = []
  const sourceUrls: string[] = []
  let confirmedWebsite: string | null = null

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.result) continue
    const { path, result } = r.value
    sourceUrls.push(`https://${domain}${path}`)
    parts.push(result.text)
    // Use the homepage canonical URL as the confirmed website link
    if (path === '/' && result.canonicalUrl && !confirmedWebsite) {
      confirmedWebsite = result.canonicalUrl
    }
  }

  return {
    content:          parts.join('\n\n---\n\n').slice(0, 8000),
    sourceUrls,
    confirmedWebsite,
  }
}

// ── Snapshot builder ──────────────────────────────────────────────────────────

async function buildSnapshot(
  company:     string,
  title:       string,
  description: string | undefined,
  location:    string | undefined,
  scraped:     string,
  sourceNote:  'official_website' | 'fallback_only',
  userId:      string,
): Promise<CompanySnapshot> {
  const hasScraped  = scraped.trim().length > 80
  const descExcerpt = (description ?? '').slice(0, 1200)

  const prompt = hasScraped
    ? `Extract structured company information for a job seeker from the scraped OFFICIAL website content below.
Only extract information explicitly present in the content. Do NOT invent any fact.

Company name: ${company}
Job title: ${title}
Job location: ${location ?? 'not specified'}
Job description excerpt: ${descExcerpt}

Scraped official website content:
${scraped}

Return ONLY valid JSON (no markdown):
{
  "company_name": "${company}",
  "overview": "2–3 factual sentences about what this company does, taken directly from the website.",
  "industry": "Industry category from the website. Null if not clearly stated.",
  "website": null,
  "headquarters": "City/region from the website. Null if not found.",
  "company_size": "Only if explicitly stated on the website (e.g. '2000 employees'). Null if not found.",
  "why_relevant": "1–2 sentences on why this company and role seem relevant based on the job description.",
  "interview_prep": [
    "Prep point based on what this company actually does (from website)",
    "Prep point based on the role or technologies mentioned",
    "Prep point about company culture, market position, or products"
  ],
  "data_limited": false,
  "source_note": "official_website"
}

Rules:
- Set data_limited:true if the website content was too thin to learn much.
- Do not invent headcount, funding, revenue, valuations, or ratings.
- interview_prep must be specific to this company and role.`
    : `Generate a company snapshot using only the job listing below. Be honest about limits.

Company: ${company}
Job Title: ${title}
Location: ${location ?? 'not specified'}
Job description:
${descExcerpt}

Return ONLY valid JSON (no markdown):
{
  "company_name": "${company}",
  "overview": "2–3 sentences about what this company appears to do, inferred from the job description.",
  "industry": "Industry inferred from the job description. Null if too uncertain.",
  "website": null,
  "headquarters": "Location from the job listing if available. Otherwise null.",
  "company_size": null,
  "why_relevant": "1–2 sentences on why this role could be relevant based on the job description.",
  "interview_prep": [
    "Research point specific to this company or role",
    "Research point about the technologies or skills required",
    "Research point about the company's market or competitors"
  ],
  "data_limited": true,
  "source_note": "fallback_only"
}

Rules:
- Do not invent headcount, funding, revenue, or ratings.
- interview_prep must be specific to this role — no generic tips.`

  const raw = await generateLightJSON<CompanySnapshot>(prompt, {
    task:       'company_snapshot',
    maxTokens:  700,
    userId,
    isFreeUser: true,
  })

  raw.company_name  = raw.company_name  || company
  raw.overview      = raw.overview      || `${company} is hiring for a ${title} role.`
  raw.why_relevant  = raw.why_relevant  || `This ${title} role at ${company} aligns with the job requirements.`
  if (!Array.isArray(raw.interview_prep)) raw.interview_prep = []
  raw.source_note   = sourceNote
  raw.website       = null   // caller sets this from the confirmed domain/URL

  return raw
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: RequestBody
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const { job_id, company, title, description, location, url, source } = body
  if (!job_id || !company) {
    return NextResponse.json({ error: 'Missing job_id or company' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Cache: check by job_id first (fastest path) ───────────────────────────
  const { data: jobMap } = await admin
    .from('job_company_snapshots')
    .select('snapshot_id')
    .eq('job_id', job_id)
    .maybeSingle()

  if (jobMap?.snapshot_id) {
    const { data: existing } = await admin
      .from('company_snapshots')
      .select('snapshot_data, updated_at')
      .eq('id', jobMap.snapshot_id)
      .maybeSingle()

    if (existing?.snapshot_data) {
      const snap      = existing.snapshot_data as { website?: string | null; source_note?: string }
      const ageDays   = (Date.now() - new Date(existing.updated_at).getTime()) / 86_400_000
      // Only serve cache if snapshot has a real website; incomplete ones are refreshed
      const isComplete = Boolean(snap.website) && snap.source_note !== 'fallback_only'
      if (ageDays < 30 && isComplete) {
        return NextResponse.json({ snapshot: existing.snapshot_data, cached: true })
      }
    }
  }

  // ── Discover domain (priority chain) ────────────────────────────────────
  const domainFromJob = domainFromUrl(url)
  let domain:       string | null   = domainFromJob
  let domainSource: DomainSource    = domainFromJob ? 'job_url' : 'none'

  // Cache: check by domain (reuse snapshot from another job at the same company)
  if (domain) {
    const { data: byDomain } = await admin
      .from('company_snapshots')
      .select('id, snapshot_data, updated_at')
      .eq('domain', domain)
      .maybeSingle()

    if (byDomain?.snapshot_data) {
      const snap       = byDomain.snapshot_data as { website?: string | null; source_note?: string }
      const ageDays    = (Date.now() - new Date(byDomain.updated_at).getTime()) / 86_400_000
      const isComplete = Boolean(snap.website) && snap.source_note !== 'fallback_only'
      if (ageDays < 30 && isComplete) {
        // Link this job to the existing snapshot for next time
        await admin.from('job_company_snapshots')
          .upsert({ job_id, snapshot_id: byDomain.id }, { onConflict: 'job_id', ignoreDuplicates: false })
        return NextResponse.json({ snapshot: byDomain.snapshot_data, cached: true })
      }
    }
  }

  // ATS slug: for Greenhouse/Lever/Workable jobs the company slug lives in the URL path
  // e.g. boards.greenhouse.io/weka/jobs/... → try weka.io, weka.com, etc.
  if (!domain) {
    const atsSlug = extractCompanySlugFromATS(url ?? '')
    if (atsSlug) {
      const atsInferred = await inferDomain(atsSlug)
      if (atsInferred) {
        domain       = atsInferred
        domainSource = 'inferred'
      }
    }
  }

  // DuckDuckGo OfficialSite / Infobox
  if (!domain) {
    const ddgResult = await findDomainViaDDG(company)
    if (ddgResult) {
      domain       = ddgResult.domain
      domainSource = ddgResult.source
    }
  }

  // Last resort: HEAD-check plausible domain slugs (handles WekaIO → weka.io, etc.)
  if (!domain) {
    const inferred = await inferDomain(company)
    if (inferred) {
      domain       = inferred
      domainSource = 'inferred'
    }
  }

  console.log(`[company-snapshot] domain=${domain ?? 'none'} source=${domainSource} company=${company}`)

  // ── Scrape (only if we have a domain) ────────────────────────────────────
  let scrapedContent    = ''
  let confirmedWebsite: string | null = null
  const sourceUrls:     string[] = []

  if (domain) {
    const result     = await scrapeCompany(domain)
    scrapedContent   = result.content
    confirmedWebsite = result.confirmedWebsite
    sourceUrls.push(...result.sourceUrls)
  }

  const sourceNote: 'official_website' | 'fallback_only' =
    domainSource !== 'none' ? 'official_website' : 'fallback_only'

  // ── Build snapshot via Claude Haiku (no user credit deduction) ────────────
  let snapshot: CompanySnapshot
  try {
    snapshot = await buildSnapshot(company, title, description, location, scrapedContent, sourceNote, user.id)
  } catch (err) {
    console.error('[company-snapshot] AI error', err)
    // Graceful fallback — return minimal info rather than an error
    snapshot = {
      company_name:   company,
      overview:       `${company} is hiring for a ${title} role.`,
      industry:       null,
      website:        confirmedWebsite ?? (domain ? `https://${domain}` : null),
      headquarters:   location ?? null,
      company_size:   null,
      why_relevant:   `This ${title} role at ${company} was matched to your resume.`,
      interview_prep: [],
      data_limited:   true,
      source_note:    sourceNote,
    }
  }

  // Set confirmed website — prefer canonical URL from homepage, then domain fallback
  snapshot.website = confirmedWebsite ?? (domain ? `https://${domain}` : null)

  // ── Persist ───────────────────────────────────────────────────────────────
  const upsertPayload = {
    company_name:  company,
    domain:        domain ?? null,
    website_url:   confirmedWebsite ?? (domain ? `https://${domain}` : null),
    overview:      snapshot.overview,
    industry:      snapshot.industry ?? null,
    location:      snapshot.headquarters ?? null,
    company_size:  snapshot.company_size ?? null,
    source_urls:   sourceUrls,
    snapshot_data: snapshot,
    updated_at:    new Date().toISOString(),
  }

  let snapshotId: string | null = null

  if (domain) {
    const { data: upserted } = await admin
      .from('company_snapshots')
      .upsert(upsertPayload, { onConflict: 'domain' })
      .select('id')
      .maybeSingle()
    snapshotId = upserted?.id ?? null
  } else {
    const { data: inserted } = await admin
      .from('company_snapshots')
      .insert(upsertPayload)
      .select('id')
      .maybeSingle()
    snapshotId = inserted?.id ?? null
  }

  // Link job → snapshot; ignoreDuplicates: false ensures we update if a better snapshot was found
  if (snapshotId) {
    await admin.from('job_company_snapshots')
      .upsert({ job_id, snapshot_id: snapshotId }, { onConflict: 'job_id', ignoreDuplicates: false })
  }

  return NextResponse.json({ snapshot, cached: false })
}
