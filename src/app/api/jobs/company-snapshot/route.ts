import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateLightJSON } from '@/lib/ai/client'
import { checkCredits, deductCredits } from '@/lib/credits'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'

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
  job_id:      string
  company:     string
  title:       string
  description?: string
  location?:   string
  url?:        string
  source?:     string
}

// Known job-aggregator domains — never expose these as the company website
const AGGREGATOR_HOSTS = [
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'google.com',
  'greenhouse.io', 'lever.co', 'workable.com', 'adzuna.com',
  'himalayas.app', 'jobicy.com', 'remoteok.com', 'arbeitnow.com',
  'jsearch.io', 'naukri.com', 'apna.co',
]

function companyWebsiteFromUrl(url?: string): string | null {
  if (!url) return null
  try {
    const { protocol, hostname } = new URL(url)
    if (AGGREGATOR_HOSTS.some(h => hostname.includes(h))) return null
    return `${protocol}//${hostname}`
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { job_id, company, title, description, location, url, source } = body
  if (!job_id || !company) {
    return NextResponse.json({ error: 'Missing required fields: job_id, company' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Cache check — no credits deducted for a cache hit ─────────────────────
  const { data: cached } = await admin
    .from('company_snapshots')
    .select('snapshot')
    .eq('job_id', job_id)
    .maybeSingle()

  if (cached?.snapshot) {
    return NextResponse.json({ snapshot: cached.snapshot, cached: true })
  }

  // ── Credit check ──────────────────────────────────────────────────────────
  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until')
    .eq('user_id', user.id)
    .single()

  const effectiveProUntil = await resolveProUntil(
    admin, user.id, profileRow?.subscription_status, profileRow?.pro_until,
  )
  const isPro     = isProUser(user.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
  const planTier  = profileRow?.subscription_status ?? (isPro ? 'pro' : 'free')

  const { allowed, balance } = await checkCredits(user.id, 'companySnapshot', isPro, admin, planTier)
  if (!allowed) {
    return NextResponse.json({
      requiresUpgrade:  true,
      reason:           'INSUFFICIENT_CREDITS',
      error:            `Not enough credits. You have ${balance.remainingCredits} remaining (need 0.5).`,
      creditsRemaining: balance.remainingCredits,
    }, { status: 402 })
  }

  // ── Build prompt ──────────────────────────────────────────────────────────
  const websiteHint   = companyWebsiteFromUrl(url)
  const descExcerpt   = description ? description.slice(0, 1200) : ''

  const prompt = `Generate a concise, accurate company snapshot for a job seeker based on the data below.

Company: ${company}
Job Title: ${title}
Location: ${location ?? 'not specified'}
Source: ${source ?? 'not specified'}
Company website hint (may be null if from an aggregator): ${websiteHint ?? 'not available'}
Job description excerpt:
${descExcerpt}

Return ONLY valid JSON — no markdown, no explanation — with this exact structure:
{
  "company_name": "The company name as written in the listing",
  "overview": "2-3 factual sentences about what this company does. Infer from the job description if no other info is available.",
  "industry": "Industry or business category (e.g. Cloud Infrastructure, FinTech, Healthcare IT). Null if genuinely unknown.",
  "website": "The company's own domain URL (e.g. https://weka.io). Null if you are not confident — do not guess.",
  "headquarters": "City and country or region (e.g. San Jose, CA, USA). Null if unknown.",
  "company_size": "One of: Startup (<50 employees), Growth-stage (50–500), Mid-size (500–5000), Enterprise (5000+). Null if unknown.",
  "why_relevant": "1–2 sentences on why this company and role could be a good fit, based on the job title and description.",
  "interview_prep": [
    "Specific research point #1 about this company or role",
    "Specific research point #2",
    "Specific research point #3"
  ],
  "data_limited": false
}

Rules:
- Set data_limited to true if you have very little information about this company beyond what is in the job description.
- Do NOT invent headcount numbers, funding amounts, revenue, valuation, ratings, or review scores.
- interview_prep items must be specific to this company and role — no generic advice.
- website: only set if you are confident it is the company's own domain (not an aggregator).`

  // ── AI call ───────────────────────────────────────────────────────────────
  let snapshot: CompanySnapshot
  try {
    snapshot = await generateLightJSON<CompanySnapshot>(prompt, {
      task:        'company_snapshot',
      maxTokens:   700,
      userId:      user.id,
      isFreeUser:  !isPro,
    })
  } catch (err) {
    console.error('[company-snapshot] AI error', err)
    return NextResponse.json({ error: 'Failed to generate company snapshot. Please try again.' }, { status: 500 })
  }

  // ── Sanitise — ensure required fields exist ───────────────────────────────
  snapshot.company_name  = snapshot.company_name  || company
  snapshot.overview      = snapshot.overview      || `${company} is the company hiring for this ${title} role.`
  snapshot.why_relevant  = snapshot.why_relevant  || `This role at ${company} matches your profile based on the job requirements.`
  if (!Array.isArray(snapshot.interview_prep)) snapshot.interview_prep = []

  // ── Cache (upsert — ignore duplicate in race condition) ───────────────────
  await admin
    .from('company_snapshots')
    .upsert({ job_id, snapshot }, { onConflict: 'job_id', ignoreDuplicates: true })

  // ── Deduct credits after successful generation ────────────────────────────
  await deductCredits(user.id, 'companySnapshot', admin)

  return NextResponse.json({ snapshot, cached: false })
}
