/**
 * POST /api/jobs/company-snapshot
 *
 * Free for all users — no credit deduction.
 *
 * Pipeline:
 *  1. Auth check
 *  2. Cache hit? → return immediately (job_id → snapshot, or domain → snapshot)
 *  3. Discover company domain (from job URL or DuckDuckGo Instant Answers)
 *  4. Check robots.txt
 *  5. Scrape home + about pages in parallel (plain fetch, no external libraries)
 *  6. Claude Haiku structures the scraped text into a clean JSON snapshot
 *     (platform cost — not charged to the user)
 *  7. Upsert into company_snapshots (domain-keyed), link in job_company_snapshots
 *  8. Return snapshot
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateLightJSON } from '@/lib/ai/client'

// ── Types ─────────────────────────────────────────────────────────────────────

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

/** DuckDuckGo Instant Answers — free, no API key, returns OfficialSite for
 *  well-known companies. Falls back to null for obscure ones. */
async function findDomainViaDDG(company: string): Promise<string | null> {
  try {
    const q   = encodeURIComponent(company)
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>
    const site = (data.OfficialSite ?? data.AbstractURL) as string | undefined
    if (!site || !site.startsWith('http')) return null
    const { hostname } = new URL(site)
    if (isAggregator(hostname)) return null
    return hostname.replace(/^www\./, '')
  } catch { return null }
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

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { 'User-Agent': BOT_UA, 'Accept': 'text/html', 'Accept-Language': 'en' },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return null
    const html   = await res.text()
    const meta   = metaContent(html, 'description') || metaContent(html, 'og:description') || ''
    const body   = htmlToText(html).slice(0, 3500)
    return [meta && `[meta] ${meta}`, body].filter(Boolean).join('\n')
  } catch { return null }
}

// ── Main scraper ──────────────────────────────────────────────────────────────

const CANDIDATE_PATHS = ['/about', '/about-us', '/company', '/about/overview', '/']

async function scrapeCompany(domain: string): Promise<{ content: string; sourceUrls: string[] }> {
  // Check robots.txt once — if root is blocked, skip everything
  const rootOk = await pathAllowed(domain, '/')
  if (!rootOk) return { content: '', sourceUrls: [] }

  // Filter paths allowed by robots.txt, then fetch in parallel (cap at 3 pages)
  const paths: string[] = []
  for (const p of CANDIDATE_PATHS) {
    if (paths.length >= 3) break
    if (await pathAllowed(domain, p)) paths.push(p)
  }

  const results = await Promise.allSettled(
    paths.map(p => fetchPageText(`https://${domain}${p}`).then(text => ({ path: p, text }))),
  )

  const parts:      string[] = []
  const sourceUrls: string[] = []

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.text) {
      sourceUrls.push(`https://${domain}${r.value.path}`)
      parts.push(r.value.text)
    }
  }

  return { content: parts.join('\n\n---\n\n').slice(0, 8000), sourceUrls }
}

// ── Snapshot builder ──────────────────────────────────────────────────────────

async function buildSnapshot(
  company:     string,
  title:       string,
  description: string | undefined,
  location:    string | undefined,
  scraped:     string,
  userId:      string,
): Promise<CompanySnapshot> {
  const hasScraped = scraped.trim().length > 80
  const descExcerpt = (description ?? '').slice(0, 1200)

  const prompt = hasScraped
    ? `Extract structured company information for a job seeker from the scraped website content below.
Only extract information that is explicitly present in the scraped content.
Do NOT invent any fact that is not clearly stated.

Company name: ${company}
Job title: ${title}
Job location: ${location ?? 'not specified'}
Job description excerpt: ${descExcerpt}

Scraped website content:
${scraped}

Return ONLY valid JSON (no markdown, no extra text):
{
  "company_name": "${company}",
  "overview": "2–3 factual sentences about what this company does, extracted from the website. If the website content is unclear, summarise from the job description only.",
  "industry": "Industry category extracted from the website content. Null if not clearly stated.",
  "website": null,
  "headquarters": "City / region extracted from the website. Null if not found.",
  "company_size": "Team size if explicitly mentioned (e.g. '200 employees'). Null if not found.",
  "why_relevant": "1–2 sentences on why this company and role seem relevant based on the job description.",
  "interview_prep": [
    "Specific prep point based on what this company actually does",
    "Specific prep point based on the role or tech stack",
    "Specific prep point the candidate should research"
  ],
  "data_limited": false
}

Rules:
- Set data_limited:true if the scraped content was too thin to learn much about the company.
- Do not invent headcount, funding, revenue, or ratings.
- interview_prep must be specific to this company and role — no generic tips.`
    : `Generate a company snapshot for a job seeker using only the job listing data below.
Be honest about what is and is not known. Do not invent details.

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
    "Research point #1 specific to this company or role",
    "Research point #2",
    "Research point #3"
  ],
  "data_limited": true
}

Rules:
- Do not invent headcount, funding, revenue, or ratings.
- interview_prep must be specific to this role — no generic tips.`

  const raw = await generateLightJSON<CompanySnapshot>(prompt, {
    task:       'company_snapshot',
    maxTokens:  700,
    userId,
    isFreeUser: true,   // cost absorbed by platform — not a user credit action
  })

  raw.company_name  = raw.company_name  || company
  raw.overview      = raw.overview      || `${company} is hiring for a ${title} role.`
  raw.why_relevant  = raw.why_relevant  || `This ${title} role at ${company} aligns with the job requirements.`
  if (!Array.isArray(raw.interview_prep)) raw.interview_prep = []
  // website is always set to null here — the caller sets it from the confirmed domain
  raw.website = null

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
      const ageDays = (Date.now() - new Date(existing.updated_at).getTime()) / 86_400_000
      if (ageDays < 30) {
        return NextResponse.json({ snapshot: existing.snapshot_data, cached: true })
      }
    }
  }

  // ── Discover domain ───────────────────────────────────────────────────────
  const domainFromJob = domainFromUrl(url)
  let domain = domainFromJob

  // Cache: check by domain (reuse snapshot from another job at the same company)
  if (domain) {
    const { data: byDomain } = await admin
      .from('company_snapshots')
      .select('id, snapshot_data, updated_at')
      .eq('domain', domain)
      .maybeSingle()

    if (byDomain?.snapshot_data) {
      const ageDays = (Date.now() - new Date(byDomain.updated_at).getTime()) / 86_400_000
      if (ageDays < 30) {
        // Link this job to the existing snapshot for next time
        await admin.from('job_company_snapshots')
          .upsert({ job_id, snapshot_id: byDomain.id }, { onConflict: 'job_id', ignoreDuplicates: true })
        return NextResponse.json({ snapshot: byDomain.snapshot_data, cached: true })
      }
    }
  }

  // If the job URL was an aggregator, try DuckDuckGo to find the real domain
  if (!domain) {
    domain = await findDomainViaDDG(company)
  }

  // ── Scrape (only if we have a domain) ────────────────────────────────────
  let scrapedContent = ''
  const sourceUrls:    string[] = []

  if (domain) {
    const result = await scrapeCompany(domain)
    scrapedContent = result.content
    sourceUrls.push(...result.sourceUrls)
  }

  // ── Build snapshot via Claude Haiku (no user credit deduction) ────────────
  let snapshot: CompanySnapshot
  try {
    snapshot = await buildSnapshot(company, title, description, location, scrapedContent, user.id)
  } catch (err) {
    console.error('[company-snapshot] AI error', err)
    // Graceful fallback — return minimal info rather than an error
    snapshot = {
      company_name:   company,
      overview:       `${company} is hiring for a ${title} role.`,
      industry:       null,
      website:        domain ? `https://${domain}` : null,
      headquarters:   location ?? null,
      company_size:   null,
      why_relevant:   `This ${title} role at ${company} was matched to your resume.`,
      interview_prep: [],
      data_limited:   true,
    }
  }

  // Set confirmed website from domain (not from AI — AI always returns null for website)
  if (domain && !snapshot.website) {
    snapshot.website = `https://${domain}`
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  const upsertPayload = {
    company_name:  company,
    domain:        domain ?? null,
    website_url:   domain ? `https://${domain}` : null,
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

  // Link job → snapshot for fast cache on next request
  if (snapshotId) {
    await admin.from('job_company_snapshots')
      .upsert({ job_id, snapshot_id: snapshotId }, { onConflict: 'job_id', ignoreDuplicates: true })
  }

  return NextResponse.json({ snapshot, cached: false })
}
