import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { rerankJobs } from '@/lib/ai/reranker'
import { callClaudeJSON } from '@/lib/ai/claude'
import type { ParsedResume, NormalizedJob } from '@/types'

export const maxDuration = 60

// ── URL metadata extraction ───────────────────────────────────────────────────

interface UrlMeta {
  title:      string
  company:    string
  location:   string
  externalId: string
}

function extractMetaFromUrl(rawUrl: string): UrlMeta {
  try {
    const u          = new URL(rawUrl)
    const domain     = u.hostname.replace(/^www\./, '')
    const domainBase = domain.split('.')[0]

    const company = domainBase
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())

    const pathParts = u.pathname.split('/').filter(Boolean)

    const refIdx     = pathParts.findIndex((p) => /^ref$/i.test(p))
    const externalId = (refIdx !== -1 && pathParts[refIdx + 1])
      ? pathParts[refIdx + 1]
      : pathParts[pathParts.length - 1] || `manual-url-${Date.now()}`

    const SKIP = /^(job[s-]?|detail|details|opening|vacancy|position|ref|id|listing|view|apply|description|search|find|career[s]?)$/i
    const slug = pathParts
      .filter((p) => p.includes('-') && !SKIP.test(p) && p !== externalId && p.length > 4)
      .sort((a, b) => b.length - a.length)[0] ?? ''

    const words    = slug.split('-').filter(Boolean)
    const CITIES   = /^(delhi|mumbai|bangalore|bengaluru|hyderabad|chennai|pune|kolkata|noida|gurgaon|gurugram|ahmedabad|london|new york|toronto|singapore|sydney|dubai|remote)$/i
    const lastWord = words[words.length - 1] ?? ''
    const location = CITIES.test(lastWord) ? lastWord.charAt(0).toUpperCase() + lastWord.slice(1) : ''
    const titleWords = location ? words.slice(0, -1) : words
    const title    = titleWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

    return { title, company, location, externalId }
  } catch {
    return { title: '', company: 'Unknown', location: '', externalId: `manual-url-${Date.now()}` }
  }
}

// ── HTML → readable text ──────────────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── AI extraction (best-effort — never throws to caller) ─────────────────────

async function aiExtractJob(text: string, urlMeta: UrlMeta | null): Promise<Partial<NormalizedJob>> {
  try {
    const result = await callClaudeJSON<{
      title?: string; company?: string; location?: string; description?: string; url?: string
    }>(
      `Extract job details from this text. Return only what is explicitly mentioned.

JOB TEXT:
${text.slice(0, 4000)}`,
      'Return JSON with keys: title, company, location, description, url. Use empty string for missing fields.'
    )
    console.log('[manual] AI extracted:', { title: result.title, company: result.company, location: result.location })
    return result
  } catch (err) {
    console.warn('[manual] AI extraction failed (using URL metadata fallback):', err instanceof Error ? err.message : err)
    return {}
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin    = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { input } = await request.json()
  if (!input || input.trim().length < 10) {
    return NextResponse.json(
      { error: 'Please paste a job description or URL.' },
      { status: 400 }
    )
  }

  const raw   = input.trim()
  const isUrl = /^https?:\/\//i.test(raw)

  // ── 1. Collect raw text ────────────────────────────────────────────────────
  let pageText = ''
  let urlMeta: UrlMeta | null = null

  if (isUrl) {
    urlMeta = extractMetaFromUrl(raw)
    console.log('[manual] URL meta:', urlMeta)

    try {
      const res = await fetch(raw, {
        headers: {
          'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: AbortSignal.timeout(12000),
      })
      console.log('[manual] fetch status:', res.status)

      if (res.ok) {
        const html = await res.text()
        console.log('[manual] HTML length:', html.length)
        const text = htmlToText(html)
        console.log('[manual] stripped length:', text.length)
        if (text.length >= 100) pageText = text.slice(0, 8000)
      }
    } catch (err) {
      console.warn('[manual] page fetch failed:', err instanceof Error ? err.message : err)
    }
  } else {
    pageText = raw
  }

  // ── 2. AI extraction (best-effort) ────────────────────────────────────────
  const ai = await aiExtractJob(pageText || raw, urlMeta)

  // ── 3. Build job with layered fallbacks — NEVER fail due to missing fields ─
  const externalId = urlMeta?.externalId ?? `manual-${Date.now()}`

  // Title: AI > URL slug > "External Job Opportunity"
  const title =
    (ai.title?.trim())         ||
    (urlMeta?.title?.trim())   ||
    'External Job Opportunity'

  // Company: AI > domain name > "Unknown Company"
  const company =
    (ai.company?.trim())       ||
    (urlMeta?.company?.trim()) ||
    'Unknown Company'

  // Location: AI > URL slug city > ''
  const location =
    (ai.location?.trim())       ||
    (urlMeta?.location?.trim()) ||
    ''

  // Description: AI > page text > URL as description
  const description =
    (ai.description?.trim())           ||
    (pageText?.trim().slice(0, 3000))   ||
    `Job posted at: ${raw}`

  // URL: AI > original input (when URL) > ''
  const url =
    (ai.url?.trim()) ||
    (isUrl ? raw : '')

  console.log('[manual] final job:', { title, company, location, externalId, descLen: description.length })

  // ── 4. Upsert into DB ──────────────────────────────────────────────────────
  const { data: savedJob, error: upsertError } = await admin
    .from('jobs')
    .upsert({
      external_id:  externalId,
      source:       'manual',
      title,
      company,
      location,
      description,
      url,
      requirements: {},
      scraped_at:   new Date().toISOString(),
    }, { onConflict: 'external_id,source' })
    .select('id')
    .single()

  if (upsertError || !savedJob) {
    console.error('[manual] upsert failed:', upsertError?.message)
    return NextResponse.json({ error: 'Failed to save job to database.' }, { status: 500 })
  }

  // ── 5. Get active resume ───────────────────────────────────────────────────
  const { data: resume } = await supabase
    .from('resumes')
    .select('id, parsed_data')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const parsedResume = resume?.parsed_data as ParsedResume | null

  // ── 6. AI scoring (best-effort) ────────────────────────────────────────────
  let aiScore     = 0
  let aiReasoning = 'Upload and analyze your resume to get a match score.'
  let matchedSkills: string[] = []
  let missingSkills: string[] = []

  if (parsedResume?.name) {
    const safeParsed = {
      ...parsedResume,
      skills:         Array.isArray(parsedResume.skills)         ? parsedResume.skills         : [],
      experience:     Array.isArray(parsedResume.experience)     ? parsedResume.experience     : [],
      education:      Array.isArray(parsedResume.education)      ? parsedResume.education      : [],
      certifications: Array.isArray(parsedResume.certifications) ? parsedResume.certifications : [],
    }
    const jobForRanking: NormalizedJob = { externalId, source: 'manual', title, company, location, description, url }
    try {
      const ranked = await rerankJobs(safeParsed, [jobForRanking])
      if (ranked.length > 0) {
        aiScore       = ranked[0].score
        aiReasoning   = ranked[0].reasoning
        matchedSkills = ranked[0].matched_skills ?? []
        missingSkills = ranked[0].missing_skills ?? []
      }
    } catch (err) {
      console.warn('[manual] scoring failed (non-fatal):', err instanceof Error ? err.message : err)
    }

    // Persist match — best-effort
    try {
      await admin.from('job_matches').upsert({
        user_id:          user.id,
        job_id:           savedJob.id,
        similarity_score: aiScore / 100,
        ai_score:         aiScore,
        ai_reasoning:     JSON.stringify({ r: aiReasoning, ms: matchedSkills, miss: missingSkills }),
      }, { onConflict: 'user_id,job_id' })
    } catch (err) {
      console.warn('[manual] job_matches upsert failed:', err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({
    match: {
      id:             `${user.id}-${savedJob.id}`,
      ai_score:       aiScore,
      ai_reasoning:   aiReasoning,
      matched_skills: matchedSkills,
      missing_skills: missingSkills,
      job: {
        id:          savedJob.id,
        title,
        company,
        location,
        url,
        salary:      undefined,
        description,
      },
    },
    // Let the client know AI couldn't extract details so it can show a softer message
    aiExtracted: Boolean(ai.title),
  })
}
