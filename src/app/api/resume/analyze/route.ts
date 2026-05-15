import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { FREE_LIMITS } from '@/lib/limits'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import { checkRateLimit, userRateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { parseResume, parseResumeFromPDF, generateHeadline } from '@/lib/ai/parser'
import { rerankJobs } from '@/lib/ai/reranker'
import { generateCvSuggestions } from '@/lib/ai/suggestions'
import { JobSourceRouter } from '@/lib/jobs/router'
import { generateSearchStrategy } from '@/lib/jobs/strategy'
import { createNotification } from '@/lib/notifications'
import { detectLocation, filterJobsByCountry, isJobFromCountry, jobMentionsCountry } from '@/lib/jobs/location'
import { buildCandidateProfile, applyAdvancedRelevanceFilter } from '@/lib/jobs/relevance'
import { hashSearchParams, getJobSearchCache, setJobSearchCache } from '@/lib/cache'
import { computeParsedResumeHash } from '@/lib/resume-hash'
import type { ParsedResume, NormalizedJob } from '@/types'
import { computeCanonicalKey } from '@/types'
import type { RankedJob } from '@/lib/ai/reranker'

export const maxDuration = 300

function apiErrMsg(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()

  if (lower.includes('credit balance') || lower.includes('plans & billing') || lower.includes('purchase credits')) {
    return 'AI processing is temporarily unavailable because the AI account has no available credits. Please add credits in billing, then try again.'
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return 'AI processing is busy right now. Please wait a moment and try again.'
  }
  if (lower.includes('api key') || lower.includes('401')) {
    return 'AI processing is not configured correctly. Please check the AI key in settings.'
  }

  return message.replace(/\s+/g, ' ').slice(0, 240)
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const cleaned = value?.trim()
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out
}

function sectionContent(sections: ParsedResume['sections'], names: string[]): string {
  const wanted = names.map((name) => name.toLowerCase())
  return (sections ?? [])
    .filter((section) => wanted.some((name) => section.title.toLowerCase().includes(name)))
    .map((section) => section.content)
    .join('\n')
    .trim()
}

function linesFrom(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/^[-•*]\s*/, ''))
    .filter((line) => line.length > 0)
}

function fallbackParseResume(rawText: string, existing: ParsedResume | null): ParsedResume {
  const sections = Array.isArray(existing?.sections) && existing.sections.length > 0
    ? existing.sections
    : [{ title: 'Resume', content: rawText }]

  const allLines = linesFrom(rawText)
  const email = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? ''
  const phone = rawText.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? ''
  const firstNameLine = allLines.find((line) =>
    line.length <= 80 &&
    !line.includes('@') &&
    !/\d{4,}/.test(line) &&
    /^[A-Za-z][A-Za-z .'-]+$/.test(line)
  )

  const skillsText = sectionContent(sections, ['skill', 'technical'])
  const skills = uniqueNonEmpty(
    skillsText
      .split(/[,|•\n]/)
      .map((skill) => skill.replace(/^(skills?|technical skills?)[:\s-]*/i, '').trim())
      .filter((skill) => skill.length >= 2 && skill.length <= 40)
  ).slice(0, 30)

  const summaryText = sectionContent(sections, ['summary', 'profile', 'objective'])
  const experienceText = sectionContent(sections, ['experience', 'employment', 'work history'])
  const educationText = sectionContent(sections, ['education', 'academic'])
  const certificationsText = sectionContent(sections, ['certification', 'license'])

  const experienceLines = linesFrom(experienceText).slice(0, 8)
  const fallbackTitle = experienceLines.find((line) => /engineer|manager|developer|analyst|consultant|lead|specialist|director|sales|marketing|designer|architect/i.test(line)) ?? ''

  return {
    name: existing?.name || firstNameLine || 'Candidate',
    email: existing?.email || email,
    phone: existing?.phone || phone,
    location: existing?.location || '',
    linkedin: existing?.linkedin,
    summary: existing?.summary || linesFrom(summaryText).slice(0, 3).join(' ') || allLines.slice(0, 3).join(' '),
    skills: existing?.skills?.length ? existing.skills : skills,
    experience: existing?.experience?.length ? existing.experience : (experienceText ? [{
      company: '',
      title: fallbackTitle,
      start_date: '',
      end_date: null,
      bullets: experienceLines.filter((line) => line !== fallbackTitle).slice(0, 6),
    }] : []),
    education: existing?.education?.length ? existing.education : linesFrom(educationText).slice(0, 3).map((line) => ({
      school: line,
      degree: '',
      field: '',
      graduation_year: '',
    })),
    certifications: existing?.certifications?.length ? existing.certifications : linesFrom(certificationsText).slice(0, 8),
    sections,
  }
}

function rankedKey(job: RankedJob): string {
  return `${job.source}:${job.externalId}`
}

function sourceSummary(jobs: Array<{ source: string }>): string {
  const counts = new Map<string, number>()
  for (const job of jobs) counts.set(job.source, (counts.get(job.source) ?? 0) + 1)
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, count]) => `${source}:${count}`)
    .join(', ') || 'none'
}

function sourceCount(jobs: Array<{ source: string }>, source: string): number {
  return jobs.filter((job) => job.source === source).length
}

function nonApifySourceCount(jobs: Array<{ source: string }>): number {
  return new Set(jobs.filter((job) => !job.source.startsWith('apify')).map((job) => job.source)).size
}

function nonApifyJobCount(jobs: Array<{ source: string }>): number {
  return jobs.filter((job) => !job.source.startsWith('apify')).length
}

const MIN_DISPLAY_SCORE = 40

function targetMatchCount(isPro: boolean): number {
  return isPro ? 20 : FREE_LIMITS.matchesPerDay
}

function selectUnifiedTop(ranked: RankedJob[], limit = 20, minScore = MIN_DISPLAY_SCORE): RankedJob[] {
  const bySource = new Map<string, RankedJob[]>()

  const eligible = ranked.filter((job) => job.score >= minScore)

  for (const job of eligible) {
    const bucket = bySource.get(job.source) ?? []
    bucket.push(job)
    bySource.set(job.source, bucket)
  }

  if (bySource.size <= 1) return eligible.slice(0, limit)

  const sources = Array.from(bySource.entries())
    .filter(([, jobs]) => jobs.length > 0)
    .sort(([, a], [, b]) => (b[0]?.score ?? 0) - (a[0]?.score ?? 0))

  const perSourceCap = Math.max(3, Math.ceil(limit / sources.length) + 1)
  const selected: RankedJob[] = []
  const selectedKeys = new Set<string>()
  const counts = new Map<string, number>()

  let progressed = true
  while (selected.length < limit && progressed) {
    progressed = false
    for (const [source, jobs] of sources) {
      if (selected.length >= limit) break
      if ((counts.get(source) ?? 0) >= perSourceCap) continue

      const next = jobs.find((job) => !selectedKeys.has(rankedKey(job)))
      if (!next) continue

      selected.push(next)
      selectedKeys.add(rankedKey(next))
      counts.set(source, (counts.get(source) ?? 0) + 1)
      progressed = true
    }
  }

  // Fill remaining slots from the same scoped run, but never below the minimum
  // display score. Scarcity is reported explicitly by the caller.
  for (const job of eligible) {
    if (selected.length >= limit) break
    if (selectedKeys.has(rankedKey(job))) continue
    selected.push(job)
    selectedKeys.add(rankedKey(job))
  }

  return selected.sort((a, b) => b.score - a.score)
}

function selectDisplayMatches({
  ranked,
  jobMap,
  targetCount,
  countryCode,
}: {
  ranked: RankedJob[]
  jobMap: Map<string, NormalizedJob>
  targetCount: number
  countryCode?: string
}): { selected: RankedJob[]; skippedLowScore: number; skippedLocation: string[] } {
  if (!countryCode) {
    const selected = selectUnifiedTop(ranked, targetCount, MIN_DISPLAY_SCORE)
    return {
      selected,
      skippedLowScore: ranked.filter((r) => r.score < MIN_DISPLAY_SCORE).length,
      skippedLocation: [],
    }
  }

  const valid: RankedJob[] = []
  const skippedLocation: string[] = []
  let skippedLowScore = 0

  for (const r of ranked) {
    const job = jobMap.get(rankedKey(r))
    if (!job) continue
    if (r.score < MIN_DISPLAY_SCORE) {
      skippedLowScore += 1
      continue
    }
    if (isJobFromCountry(job, countryCode)) {
      valid.push(r)
      if (valid.length >= targetCount) break
    } else {
      skippedLocation.push(`"${job.title}" @ ${job.location ?? 'null'}`)
    }
  }

  return { selected: valid, skippedLowScore, skippedLocation }
}

function buildBroadJobBoardQueries(parsedResume: ParsedResume, searchQueries: string[]): string[] {
  const titles = (parsedResume.experience ?? [])
    .map((exp) => exp.title ?? '')
    .filter((title): title is string => Boolean(title))

  return uniqueNonEmpty([
    ...titles,
    ...searchQueries.map((query) =>
      query
        .replace(/\b(oem|enterprise|government|procurement|hardware|india|fae)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    ),
  ]).filter((query) => query.length > 2)
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)
}

function candidateTerms(parsedResume: ParsedResume, searchQueries: string[]): Set<string> {
  const text = [
    parsedResume.summary,
    parsedResume.skills?.join(' '),
    ...(parsedResume.experience ?? []).flatMap((exp) => [
      exp.title,
      exp.company,
      exp.bullets?.join(' '),
    ]),
    ...searchQueries,
  ].filter(Boolean).join(' ')

  return new Set(tokenize(text))
}

function heuristicFit(job: NormalizedJob, terms: Set<string>): number {
  const titleTokens = tokenize(job.title)
  const bodyTokens = tokenize(`${job.company} ${job.location} ${job.description}`)
  let score = 0

  for (const token of titleTokens) {
    if (terms.has(token)) score += 5
  }
  for (const token of bodyTokens.slice(0, 180)) {
    if (terms.has(token)) score += 1
  }

  return score
}

function selectScoringPool(
  jobs: NormalizedJob[],
  parsedResume: ParsedResume,
  searchQueries: string[],
  limit = 60
): NormalizedJob[] {
  const terms = candidateTerms(parsedResume, searchQueries)
  const bySource = new Map<string, NormalizedJob[]>()
  for (const job of jobs) {
    const bucket = bySource.get(job.source) ?? []
    bucket.push(job)
    bySource.set(job.source, bucket)
  }

  const sources = Array.from(bySource.entries())
    .map(([source, sourceJobs]) => [
      source,
      [...sourceJobs].sort((a, b) => heuristicFit(b, terms) - heuristicFit(a, terms)),
    ] as const)
    .filter(([, sourceJobs]) => sourceJobs.length > 0)
    .sort(([, a], [, b]) => b.length - a.length)
  if (sources.length <= 1) return jobs.slice(0, limit)

  const perSourceCap = Math.max(10, Math.ceil(limit / sources.length) + 3)
  const selected: NormalizedJob[] = []
  const selectedKeys = new Set<string>()
  const selectedCounts = new Map<string, number>()

  let progressed = true
  while (selected.length < limit && progressed) {
    progressed = false
    for (const [source, sourceJobs] of sources) {
      if (selected.length >= limit) break
      if ((selectedCounts.get(source) ?? 0) >= perSourceCap) continue

      const next = sourceJobs.find((job) => !selectedKeys.has(`${job.source}:${job.externalId}`))
      if (!next) continue

      selected.push(next)
      selectedKeys.add(`${next.source}:${next.externalId}`)
      selectedCounts.set(source, (selectedCounts.get(source) ?? 0) + 1)
      progressed = true
    }
  }

  const remainingByHeuristic = [...jobs].sort((a, b) => heuristicFit(b, terms) - heuristicFit(a, terms))
  for (const job of remainingByHeuristic) {
    if (selected.length >= limit) break
    const key = `${job.source}:${job.externalId}`
    if (selectedKeys.has(key)) continue
    selected.push(job)
    selectedKeys.add(key)
  }

  return selected
}

// Human-readable display names for job sources (used in progress descriptions)
const SOURCE_DISPLAY: Record<string, string> = {
  adzuna:         'Adzuna',
  jsearch:        'JSearch',
  himalayas:      'Himalayas',
  jobicy:         'Jobicy',
  remoteok:       'RemoteOK',
  arbeitnow:      'Arbeitnow',
  jobspy:         'JobSpy',
  apify_linkedin: 'LinkedIn',
  apify_indeed:   'Indeed',
  apify_naukri:   'Naukri',
  apify_apna:     'Apna',
  apify_upwork:   'Upwork',
}

function currentSourceNames(jobs: Array<{ source: string }>): string[] {
  return Array.from(new Set(jobs.map(j => SOURCE_DISPLAY[j.source] ?? j.source))).sort()
}

// SSE event types emitted to the client
export type AnalyzeProgressEvent =
  | { step: 'resume_loaded' }
  | { step: 'profile_parsed' }
  | { step: 'strategy_ready' }
  | { step: 'jobs_fetching'; count: number; sources: string[] }
  | { step: 'pool_selected'; count: number }
  | { step: 'ai_ranking' }
  | { step: 'matches_saved' }
  | {
      done: true
      matchCount: number
      cvSuggestions: string[]
      message?: string
      detectedCountry?: string
      detectedCity?: string
      cached?: boolean
      creditCost?: number
      creditsRemaining?: number
      searchRunId?: string | null
      searchScope?: {
        searchMode: 'country' | 'international_remote'
        countryCode: string | null
        countryName: string | null
        searchRunId: string | null
      }
      counts?: Record<string, unknown>
      scarcityReason?: string | null
    }
  | { error: string }

export async function POST(req: Request) {
  // ── 0. Environment sanity check ────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set in .env.local' },
      { status: 500 }
    )
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Read request body ─────────────────────────────────────────────────────
  let force = false
  let forceJobsFetch = false  // bypasses job-search cache only (not composite analysis cache)
  let selectedSearchCountry: string | null = null  // country code e.g. "in", "us" — provided after user confirms
  let searchMode: 'country' | 'international_remote' | null = null
  let wasDetected = false
  // parse_resume: upload/reanalyze flows — skip country gate, auto-detect from resume.
  // job_search (or no mode): matched-jobs flow — apply country gate.
  let mode: 'parse_resume' | 'job_search' | null = null
  try {
    const body = await req.json().catch(() => ({}))
    force = Boolean(body?.force)
    selectedSearchCountry = (body?.selectedSearchCountry as string | null | undefined) ?? null
    searchMode = (body?.searchMode as 'country' | 'international_remote' | undefined) ?? null
    wasDetected = Boolean(body?.wasDetected)
    mode = (body?.mode as 'parse_resume' | 'job_search' | undefined) ?? null
    forceJobsFetch = Boolean(body?.forceJobsFetch)
  } catch { /* no body — treat as non-forced */ }
  console.log(`[analyze] request | user=${user.id} | mode=${mode ?? 'job_search'} | force=${force} | forceJobsFetch=${forceJobsFetch} | searchMode=${searchMode ?? 'precheck'} | country=${selectedSearchCountry ?? 'none'}`)

  // ── Rate limit: 3 analyze runs / minute / user ───────────────────────────
  const rlResult = await checkRateLimit(
    userRateLimitKey(user.id, 'resume_analyze'),
    'default',
    admin,
  )
  if (!rlResult.allowed) {
    console.warn(`[analyze] rate-limited | user=${user.id}`)
    return NextResponse.json(rateLimitResponse(rlResult), { status: 429 })
  }

  // ── Free-plan re-analyze limit (checked before stream starts) ─────────────
  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until, plan_tier, ai_reanalyze_count, last_analyzed_resume_hash')
    .eq('user_id', user.id)
    .single()

  const effectiveProUntil = await resolveProUntil(
    admin, user.id, profileRow?.subscription_status, profileRow?.pro_until,
  )
  const isPro    = isProUser(user.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
  const planTier = (profileRow?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')
  const targetCount = targetMatchCount(isPro)
  const currentReanalyzeCount = profileRow?.ai_reanalyze_count ?? 0
  const lastAnalyzedHash = profileRow?.last_analyzed_resume_hash ?? ''

  if (mode !== 'parse_resume' && !isPro && currentReanalyzeCount >= FREE_LIMITS.aiReanalyze) {
    return NextResponse.json({
      error: `You've used all ${FREE_LIMITS.aiReanalyze} free AI re-analyses. Upgrade to keep finding better job matches.`,
      limitReached: true,
    }, { status: 403 })
  }

  // ── 1. Fetch active resume (early exit before stream starts) ───────────────
  const { data: resume, error: resumeError } = await supabase
    .from('resumes')
    .select('id, raw_text, parsed_data, file_url, resume_hash')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (resumeError || !resume) {
    return NextResponse.json(
      { error: 'No active resume found. Please upload one first.' },
      { status: 404 }
    )
  }

  // ── Country confirmation gate ──────────────────────────────────────────────
  // Only fires for job_search mode (matched-jobs page). parse_resume callers
  // (upload, reanalyze, AI-create) skip this gate and auto-detect country below.
  const currentHash = (resume as Record<string, unknown>).resume_hash as string | null
  if (mode !== 'parse_resume' && !selectedSearchCountry && searchMode !== 'international_remote') {
    const pd = resume.parsed_data as ParsedResume | null
    const resumeLocation = pd?.location?.trim() ?? ''
    const loc = detectLocation(resumeLocation)
    console.log(`[analyze] country_confirmation_required | user=${user.id} | detected=${loc.countryName || 'none'} (${loc.countryCode || 'none'})`)
    return NextResponse.json({
      status: 'country_confirmation_required',
      detectedCountry: loc.countryName || null,
      detectedCountryCode: loc.countryCode || null,
    })
  }

  // ── parse_resume mode: parse only, save, return country confirmation ─────────
  // No credits charged, no job search. Frontend calls again with selectedSearchCountry
  // after the user confirms their target country.
  if (mode === 'parse_resume') {
    let parsedData = resume.parsed_data as ParsedResume | null

    if (!parsedData?.name) {
      try {
        if (resume.raw_text && resume.raw_text.length >= 50) {
          parsedData = await parseResume(resume.raw_text, user.id, !isPro)
        } else if (resume.file_url) {
          const fileRes = await fetch(resume.file_url)
          if (!fileRes.ok) throw new Error('Could not download resume file from storage')
          const buffer = Buffer.from(await fileRes.arrayBuffer())
          parsedData = await parseResumeFromPDF(buffer, user.id, !isPro)
        } else {
          throw new Error('No resume text or file found. Please upload your resume again.')
        }
        await Promise.all([
          admin.from('resumes').update({ parsed_data: parsedData }).eq('id', resume.id),
          admin.from('profiles').update({
            full_name: parsedData.name || undefined,
            phone:     parsedData.phone || undefined,
            location:  parsedData.location || undefined,
            summary:   parsedData.summary || undefined,
            skills:    parsedData.skills || [],
          }).eq('user_id', user.id),
        ])
        console.log(`[analyze] parse_resume: parsed and saved | user=${user.id}`)
      } catch (err) {
        const msg = apiErrMsg(err)
        console.error('[analyze] parse_resume: AI parsing failed, using text fallback:', msg)

        const fallbackText = (resume.raw_text && resume.raw_text.length >= 50)
          ? resume.raw_text
          : JSON.stringify((resume.parsed_data as ParsedResume | null)?.sections ?? [])

        if (!fallbackText || fallbackText.length < 20) {
          return NextResponse.json({ error: `Resume parsing failed: ${msg}` }, { status: 500 })
        }

        parsedData = fallbackParseResume(fallbackText, resume.parsed_data as ParsedResume | null)
        await Promise.all([
          admin.from('resumes').update({ parsed_data: parsedData }).eq('id', resume.id),
          admin.from('profiles').update({
            full_name: parsedData.name || undefined,
            phone:     parsedData.phone || undefined,
            location:  parsedData.location || undefined,
            summary:   parsedData.summary || undefined,
            skills:    parsedData.skills || [],
          }).eq('user_id', user.id),
        ])
        console.warn(`[analyze] parse_resume: fallback parsed and saved | user=${user.id}`)
      }
    }

    const loc = detectLocation((parsedData?.location ?? '').trim())
    console.log(`[analyze] parse_resume complete — country confirmation | user=${user.id} | detected=${loc.countryName || 'none'} (${loc.countryCode || 'none'})`)
    return NextResponse.json({
      status: 'country_confirmation_required',
      detectedCountry:     loc.countryName  || null,
      detectedCountryCode: loc.countryCode  || null,
    })
  }

  // ── Cache check: composite key = resumeHash + searchCountry + searchMode ──────
  // Must run BEFORE the credit check so cached responses don't charge credits.
  // A resume searched for India and the same resume searched for US must produce
  // separate cache entries. force=true bypasses entirely.
  const MATCH_CACHE_VALID_MS = 24 * 60 * 60 * 1000 // 24 hours
  const cacheSearchKey = searchMode === 'international_remote'
    ? 'international_remote'
    : (selectedSearchCountry ?? 'unknown')
  const compositeAnalysisKey = currentHash ? `${currentHash}:${cacheSearchKey}` : null
  console.log(`[analyze] resume_hash=${currentHash ?? 'none'} | cache_key=${compositeAnalysisKey ?? 'none'} | last_analyzed_hash=${lastAnalyzedHash || 'none'} | key_match=${compositeAnalysisKey === lastAnalyzedHash}`)

  // Country-name map used for both the per-country run cache and the pipeline below.
  // Defined here (outside the stream) so the pre-stream cache check can use it too.
  const COUNTRY_CODE_TO_NAME_MAP: Record<string, string> = {
    in: 'India', us: 'United States', gb: 'United Kingdom',
    ca: 'Canada', au: 'Australia', de: 'Germany',
    fr: 'France', nl: 'Netherlands', sg: 'Singapore',
    ae: 'UAE', nz: 'New Zealand', za: 'South Africa',
  }

  function makeCachedSSEResponse(
    matchCount: number,
    searchRunId: string | null,
    scope: { searchMode: 'country' | 'international_remote'; countryCode: string | null; countryName: string | null },
  ): Response {
    const returnedCount = Math.min(matchCount, targetCount)
    const enc = new TextEncoder()
    const s = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ step: 'resume_loaded' })}\n\n`))
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({
          done: true,
          matchCount: returnedCount,
          cvSuggestions: [],
          cached: true,
          searchRunId,
          searchScope: { ...scope, searchRunId },
          counts: { saved: matchCount, returned: returnedCount },
        })}\n\n`))
        ctrl.close()
      },
    })
    return new Response(s, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' },
    })
  }

  // ── Per-country run cache (handles India → International → India correctly) ─
  // The composite key above only matches if the LAST analysed hash equals the
  // current combination — so it misses after switching countries. This check
  // queries job_search_runs directly for a recent successful run for the exact
  // target country, regardless of what was analysed last.
  if (!force) {
    const preScope = searchMode === 'international_remote'
      ? { searchMode: 'international_remote' as const, countryCode: null, countryName: null }
      : (selectedSearchCountry
          ? {
              searchMode: 'country' as const,
              countryCode: selectedSearchCountry,
              countryName: COUNTRY_CODE_TO_NAME_MAP[selectedSearchCountry] ?? selectedSearchCountry,
            }
          : null)
    if (preScope) {
      const preResumeParsed = resume.parsed_data as ParsedResume | null
      const preResumeHash   = preResumeParsed ? computeParsedResumeHash(preResumeParsed) : null
      if (preResumeHash) {
        let existingRunQuery = admin
          .from('job_search_runs')
          .select('id, created_at, final_saved_count, failure_reason')
          .eq('user_id', user.id)
          .eq('resume_hash', preResumeHash)
          .eq('status', 'success')
          .eq('search_mode', preScope.searchMode)
          .order('created_at', { ascending: false })
          .limit(1)
        existingRunQuery = preScope.countryCode
          ? existingRunQuery.eq('country_code', preScope.countryCode)
          : existingRunQuery.is('country_code', null)
        const { data: existingRun } = await existingRunQuery.maybeSingle()
        if (existingRun) {
          const runAgeMs = Date.now() - new Date(existingRun.created_at).getTime()
          const savedCount = existingRun.final_saved_count ?? 0
          if (runAgeMs <= MATCH_CACHE_VALID_MS && savedCount >= targetCount) {
            console.log(`[analyze] scoped run cache HIT | scope=${preScope.searchMode}:${preScope.countryCode ?? 'remote'} | run=${existingRun.id} | age=${(runAgeMs/3600000).toFixed(1)}h - serving from DB`)
            const { count } = await admin
              .from('job_matches')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('search_run_id', existingRun.id)
              .gte('ai_score', MIN_DISPLAY_SCORE)
            return makeCachedSSEResponse(count ?? 0, existingRun.id, preScope)
          }
          if (runAgeMs <= MATCH_CACHE_VALID_MS) {
            console.warn(`[analyze] scoped run cache MISS_UNDER_QUOTA | scope=${preScope.searchMode}:${preScope.countryCode ?? 'remote'} | run=${existingRun.id} | saved=${savedCount}/${targetCount} | reason=${existingRun.failure_reason ?? 'none'} - fresh pipeline`)
          }
          console.log(`[analyze] scoped run stale | scope=${preScope.searchMode}:${preScope.countryCode ?? 'remote'} | run=${existingRun.id} | age=${(runAgeMs/3600000).toFixed(1)}h - fresh pipeline`)
        }
      }
    }
  }

  // Legacy global match cache intentionally removed for reliability.  A cached
  // response must come from the exact scoped run above, never from all matches.

  // ── Credit check: runs AFTER exact scoped cache so cached responses don't charge ─
  const { allowed: creditAllowed, balance: creditBalance, cost: creditCost } =
    await checkCredits(user.id, 'jobRerank', isPro, admin, planTier)
  if (!creditAllowed) {
    return NextResponse.json(
      insufficientCreditsResponse('jobRerank', creditBalance.remainingCredits),
      { status: 402 }
    )
  }

  // ── Start SSE stream — all progress events flow through this ───────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: AnalyzeProgressEvent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // client disconnected — ignore
        }
      }

      let runId: string | null = null
      try {
        emit({ step: 'resume_loaded' })

        // ── 2. Parse resume if not already done ──────────────────────────────
        let parsedResume = resume.parsed_data as ParsedResume
        // Use the same "already parsed" check as the resume page — name OR skills OR experience
        // ensures a location-change flow never re-parses a resume that was parsed without a name
        const isAlreadyParsed = Boolean(
          parsedResume?.name ||
          (Array.isArray(parsedResume?.skills) && parsedResume.skills.length > 0) ||
          (Array.isArray(parsedResume?.experience) && parsedResume.experience.length > 0)
        )
        console.log(`[analyze] parsed_resume_status: isAlreadyParsed=${isAlreadyParsed} name=${!!parsedResume?.name} skills=${Array.isArray(parsedResume?.skills) ? parsedResume.skills.length : 0} exp=${Array.isArray(parsedResume?.experience) ? parsedResume.experience.length : 0}`)
        if (!isAlreadyParsed) {
          try {
            if (resume.raw_text && resume.raw_text.length >= 50) {
              parsedResume = await parseResume(resume.raw_text, user.id, !isPro)
            } else if (resume.file_url) {
              const fileRes = await fetch(resume.file_url)
              if (!fileRes.ok) throw new Error('Could not download resume file from storage')
              const buffer = Buffer.from(await fileRes.arrayBuffer())
              parsedResume = await parseResumeFromPDF(buffer, user.id, !isPro)
            } else {
              throw new Error('No resume text or file found. Please upload your resume again.')
            }
            const [resumeUpdate] = await Promise.all([
              admin.from('resumes').update({ parsed_data: parsedResume }).eq('id', resume.id),
              admin.from('profiles').update({
                full_name: parsedResume.name || undefined,
                phone: parsedResume.phone || undefined,
                location: parsedResume.location || undefined,
                summary: parsedResume.summary || undefined,
                skills: parsedResume.skills || [],
              }).eq('user_id', user.id),
            ])
            if (resumeUpdate.error) {
              throw new Error(`Failed to save parsed resume data: ${resumeUpdate.error.message}`)
            }
          } catch (err) {
            const msg = apiErrMsg(err)
            console.error('[analyze] parse failed:', msg)
            throw new Error(`Resume parsing failed: ${msg}`)
          }
        }

        // Ensure arrays are always arrays
        parsedResume = {
          ...parsedResume,
          skills: Array.isArray(parsedResume.skills) ? parsedResume.skills : [],
          experience: Array.isArray(parsedResume.experience) ? parsedResume.experience : [],
          education: Array.isArray(parsedResume.education) ? parsedResume.education : [],
          certifications: Array.isArray(parsedResume.certifications) ? parsedResume.certifications : [],
        }

        emit({ step: 'profile_parsed' })

        // ── 2a-run. Create a job_search_runs row for this analysis ────────────
        // Mark any stuck "running" runs (>30 min old) as failed first.
        const stuckCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
        void admin
          .from('job_search_runs')
          .update({ status: 'failed', completed_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('status', 'running')
          .lt('created_at', stuckCutoff)

        const parsedResumeHash = computeParsedResumeHash(parsedResume)
        const initialSearchMode: 'country' | 'international_remote' =
          searchMode === 'international_remote' ? 'international_remote' : 'country'
        const initialCountryCode = initialSearchMode === 'country' ? selectedSearchCountry : null
        const initialCountryName = initialCountryCode
          ? (COUNTRY_CODE_TO_NAME_MAP[initialCountryCode] ?? initialCountryCode)
          : null
        const { data: runRow } = await admin
          .from('job_search_runs')
          .insert({
            user_id:       user.id,
            resume_hash:   parsedResumeHash,
            status:        'running',
            search_mode:   initialSearchMode,
            country_code:  initialCountryCode,
            country_name:  initialCountryName,
            detected_location: initialSearchMode === 'international_remote'
              ? 'international_remote'
              : initialCountryName,
          })
          .select('id')
          .single()
        runId = runRow?.id ?? null

        // ── 2b. Generate headline if profile has none ─────────────────────────
        try {
          const { data: profileRow } = await admin
            .from('profiles')
            .select('headline')
            .eq('user_id', user.id)
            .single()

          if (!profileRow?.headline) {
            const headline = await generateHeadline(parsedResume, user.id, !isPro)
            console.log('[analyze] Generated Headline:', headline)
            if (headline) {
              await admin.from('profiles').update({ headline }).eq('user_id', user.id)
            }
          } else {
            console.log('[analyze] Headline already exists, skipping generation')
          }
        } catch (err) {
          console.error('[analyze] headline generation failed (non-fatal):', err)
        }

        // ── 3. Generate AI search strategy ────────────────────────────────────

        // Resolve search country from user's confirmed choice (never silently default to India).
        // resumeCountry = what's on the resume (display/info only, never drives job search).
        // searchCountry = what the user chose → drives all fetching, filtering, and Apify logic.
        // (COUNTRY_CODE_TO_NAME_MAP is defined above the stream and reused here)
        const COUNTRY_CODE_TO_NAME = COUNTRY_CODE_TO_NAME_MAP
        // Pipeline counts — populated as each stage completes, written to the run on success
        let jobsFetchedCount           = 0
        let rawFetchedCount            = 0
        let jobsAfterCountryFilter     = 0
        let jobsAfterRelevanceFilter   = 0
        let jobsScoredCount            = 0
        const sourceFetchCounts: Record<string, number> = {}

        const resumeCountry = parsedResume.location?.trim() ?? ''
        const resumeDetectedLocation = detectLocation(resumeCountry)
        const isInternational = searchMode === 'international_remote'
        const searchCountryCode = (!isInternational && selectedSearchCountry) ? selectedSearchCountry : ''
        const profileLocation = isInternational ? '' : (COUNTRY_CODE_TO_NAME[searchCountryCode] ?? searchCountryCode ?? '')
        const countryCode: string | undefined = isInternational ? undefined : (searchCountryCode || undefined)
        const isIndiaProfile = !isInternational && searchCountryCode === 'in'
        const excludedInternationalCountryCode = isInternational ? resumeDetectedLocation.countryCode : ''

        // Log user's confirmed country choice
        if (isInternational) {
          console.log(`[analyze] user selected international/remote search | user=${user.id}`)
        } else if (wasDetected) {
          console.log(`[analyze] user confirmed detected country: ${profileLocation} | user=${user.id}`)
        } else {
          console.log(`[analyze] user selected different search country: ${profileLocation} | user=${user.id}`)
        }

        let strategy
        try {
          strategy = await generateSearchStrategy(
            (resume.raw_text && resume.raw_text.length >= 100) ? resume.raw_text : '',
            parsedResume,
          )
          console.log('[analyze] AI strategy queries:', strategy.search_queries)
        } catch (err) {
          console.error('[analyze] strategy generation failed, using fallback:', apiErrMsg(err))
          const recentTitle = parsedResume.experience?.[0]?.title?.trim() ?? ''
          strategy = { search_queries: [recentTitle || parsedResume.skills?.[0] || 'software engineer'], target_companies: [], competitors: { direct: [], adjacent: [] } }
        }

        function sanitizeQuery(q: string): string {
          return q.replace(/[/\\|&"'()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
        }

        function stripInternationalLocality(q: string): string {
          if (!isInternational) return q

          const terms = uniqueNonEmpty([
            resumeDetectedLocation.countryName,
            resumeDetectedLocation.city,
            resumeDetectedLocation.countryCode === 'in' ? 'India' : null,
            resumeDetectedLocation.countryCode === 'in' ? 'Bengaluru' : null,
            resumeDetectedLocation.countryCode === 'in' ? 'Bangalore' : null,
          ])
          let cleaned = q
          for (const term of terms) {
            cleaned = cleaned.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ')
          }
          return sanitizeQuery(cleaned)
        }

        const cleanedQueries = strategy.search_queries
          .map(sanitizeQuery)
          .map(stripInternationalLocality)
          .filter((q) => q.length > 2)

        const primaryQuery = cleanedQueries[0] ?? stripInternationalLocality(parsedResume.experience?.[0]?.title?.trim().replace(/[/\\|&"'()]/g, ' ').trim() || 'software engineer')

        const detectedLocation = { countryCode: searchCountryCode, countryName: profileLocation, city: '' }
        console.log('[analyze] resume location:', resumeCountry, '| search country:', profileLocation || 'international/remote', '(', countryCode ?? 'none', ') | source mode: all-sources-top20')
        console.log('[analyze] cleaned queries:', cleanedQueries)
        console.log(`[PIPELINE] Resume country: ${resumeCountry || 'Unknown'} | Search country: ${profileLocation || 'international/remote'} (${countryCode ?? 'none'})`)

        emit({ step: 'strategy_ready' })

        // ── 4. Fetch jobs via multi-source router ─────────────────────────────
        const router = new JobSourceRouter()
        const jobs: NormalizedJob[] = []
        const seenKeys        = new Set<string>()
        const seenCanonical   = new Set<string>()

        function addUnique(incoming: NormalizedJob[]) {
          rawFetchedCount += incoming.length
          for (const job of incoming) {
            sourceFetchCounts[job.source] = (sourceFetchCounts[job.source] ?? 0) + 1
          }
          for (const job of incoming) {
            const key       = `${job.source}:${job.externalId}`
            const canonical = computeCanonicalKey(job.company, job.title, job.location)
            // Deduplicate both by source+id AND by canonical title+company+city
            // so the same opening fetched from Adzuna AND Naukri appears only once.
            if (!seenKeys.has(key) && !seenCanonical.has(canonical)) {
              seenKeys.add(key)
              seenCanonical.add(canonical)
              jobs.push(job)
            }
          }
        }

        const sourceErrors: Array<{ source: string; error: string }> = []
        const experienceQueries = (parsedResume.experience ?? [])
          .map((exp) => sanitizeQuery(exp.title ?? ''))
          .filter((q) => q.length > 2)
        const searchQueries = uniqueNonEmpty([
          ...cleanedQueries,
          ...experienceQueries,
          primaryQuery,
        ]).slice(0, 12)

        // Build competitor list early — needed for both search targeting and post-filter logging
        const allCompetitors = [
          ...(strategy.competitors?.direct   ?? []),
          ...(strategy.competitors?.adjacent ?? []),
        ]
        const competitorSet    = new Set(allCompetitors.map((c) => c.toLowerCase()))
        const candidateProfile = buildCandidateProfile(parsedResume, searchQueries)

        console.log(`[PIPELINE] Queries generated: [${searchQueries.map((q) => `"${q}"`).join(', ')}]`)
        console.log(`[PIPELINE_AUDIT] search_engine=claude search_run_id=${runId ?? 'none'} user_plan=${planTier} target_count=${targetCount}`)
        console.log(`[PIPELINE] Competitor companies: direct=[${strategy.competitors?.direct?.join(', ') ?? ''}] adjacent=[${strategy.competitors?.adjacent?.join(', ') ?? ''}]`)

        // Emit initial jobs_fetching to signal search has started
        emit({ step: 'jobs_fetching', count: 0, sources: [] })

        // ── Job search cache check — skip external API calls on recent hit ────
        // force=true OR forceJobsFetch=true bypasses this.
        // forceJobsFetch is set on location-change flows to guarantee fresh jobs
        // without bypassing the composite analysis cache.
        const searchCacheHash = hashSearchParams(searchQueries, isInternational ? '__international__' : profileLocation)
        let fromJobSearchCache = false
        if (!force && !forceJobsFetch) {
          const cachedJobs = await getJobSearchCache(admin, user.id, searchCacheHash)
          if (cachedJobs && cachedJobs.length > 0) {
            addUnique(cachedJobs)
            fromJobSearchCache = true
            console.log(`[analyze] job search cache hit | user=${user.id} | jobs=${jobs.length} | cache_hash=${searchCacheHash}`)
            emit({ step: 'jobs_fetching', count: jobs.length, sources: currentSourceNames(jobs) })
          }
        }

        if (!fromJobSearchCache) {
        console.log('[analyze] competitor intelligence — direct:', strategy.competitors?.direct ?? [], '| adjacent:', strategy.competitors?.adjacent ?? [])

        // 4a. Fetch every configured source — run all strategy queries (up to 8)
        for (const query of searchQueries.slice(0, 8)) {
          console.log('[analyze] strategy query:', query, '| source mode: standard')
          try {
            const result = await router.searchAllForScoring({ title: query, location: profileLocation, countryCode, limit: Math.max(30, targetCount * 3) })
            addUnique(result.jobs)
            sourceErrors.push(...result.errors)
            console.log('[analyze] query "' + query + '" → ' + result.jobs.length + ' provider-preserved jobs (total unique stored candidates: ' + jobs.length + ') sources:', sourceSummary(result.jobs))
          } catch (err) {
            console.error('[analyze] query "' + query + '" error:', apiErrMsg(err))
          }
          emit({ step: 'jobs_fetching', count: jobs.length, sources: currentSourceNames(jobs) })
        }

        // Adzuna broad pass
        if (sourceCount(jobs, 'adzuna') < 10) {
          console.log('[analyze] Adzuna broadening pass without city restriction')
          for (const query of buildBroadJobBoardQueries(parsedResume, searchQueries).slice(0, 8)) {
            try {
              const result = await router.searchSource({ title: query, location: '', countryCode, limit: Math.max(30, targetCount * 3) }, 'adzuna')
              addUnique(result.jobs)
              sourceErrors.push(...result.errors)
              console.log(`[analyze] broad Adzuna "${query}" → ${result.jobs.length} jobs (total: ${jobs.length}) sources: ${sourceSummary(result.jobs)}`)
              if (sourceCount(jobs, 'adzuna') >= 15) break
            } catch (err) {
              console.error(`[analyze] broad Adzuna "${query}" error:`, apiErrMsg(err))
            }
            emit({ step: 'jobs_fetching', count: jobs.length, sources: currentSourceNames(jobs) })
          }
        }

        // No-location fallback
        if (jobs.length < targetCount * 6) {
          console.log('[analyze] trying without location restriction')
          for (const query of searchQueries.slice(0, 6)) {
            if (jobs.length >= targetCount * 8) break
            try {
              const r = await router.searchAllForScoring({ title: query, location: '', countryCode, limit: Math.max(30, targetCount * 3) })
              addUnique(r.jobs)
              sourceErrors.push(...r.errors)
              console.log('[analyze] no-location "' + query + '", total now', jobs.length, 'jobs')
            } catch (err) {
              console.error('[analyze] no-location error:', apiErrMsg(err))
            }
            emit({ step: 'jobs_fetching', count: jobs.length, sources: currentSourceNames(jobs) })
          }
        }

        // Company-targeted search
        if (strategy.target_companies?.length) {
          console.log('[analyze] company-targeted search for:', strategy.target_companies.slice(0, 3))
          for (const company of strategy.target_companies.slice(0, 2)) {
            const companyQuery = sanitizeQuery(`${company} ${primaryQuery}`)
            try {
              const result = await router.searchAllForScoring({ title: companyQuery, location: profileLocation, countryCode, limit: Math.max(20, targetCount * 2) })
              addUnique(result.jobs)
              sourceErrors.push(...result.errors)
              console.log(`[analyze] company "${company}" → ${result.jobs.length} provider-preserved jobs (total: ${jobs.length}) sources: ${sourceSummary(result.jobs)}`)
            } catch (err) {
              console.error(`[analyze] company search "${company}" error:`, apiErrMsg(err))
            }
            emit({ step: 'jobs_fetching', count: jobs.length, sources: currentSourceNames(jobs) })
          }
        }

        // Competitor-targeted search — direct competitors first, then adjacent
        const competitorTargets = [
          ...(strategy.competitors?.direct   ?? []).slice(0, 3),
          ...(strategy.competitors?.adjacent ?? []).slice(0, 2),
        ]
        if (competitorTargets.length > 0) {
          console.log('[analyze] competitor-targeted search for:', competitorTargets)
          for (const company of competitorTargets) {
            if (jobs.length >= 200) break
            const companyQuery = sanitizeQuery(`${company} ${primaryQuery}`)
            try {
              const result = await router.searchAllForScoring({ title: companyQuery, location: profileLocation, countryCode, limit: Math.max(20, targetCount * 2) })
              addUnique(result.jobs)
              sourceErrors.push(...result.errors)
              console.log(`[analyze] competitor "${company}" → ${result.jobs.length} jobs (total: ${jobs.length}) sources: ${sourceSummary(result.jobs)}`)
            } catch (err) {
              console.error(`[analyze] competitor search "${company}" error:`, apiErrMsg(err))
            }
            emit({ step: 'jobs_fetching', count: jobs.length, sources: currentSourceNames(jobs) })
          }
        }

        // Apify pass — always run for India profiles (Naukri/LinkedIn cover India far better than
        // Adzuna/JSearch); run for other profiles only if standard sources produced too few results.
        const apifyNaukri = sourceCount(jobs, 'apify_linkedin') + sourceCount(jobs, 'apify_naukri') + sourceCount(jobs, 'apify_apna')
        const shouldRunApify = isIndiaProfile || nonApifyJobCount(jobs) < 60 || nonApifySourceCount(jobs) < 2
        if (shouldRunApify) {
          console.log('[analyze] Apify pass enabled | isIndia:', isIndiaProfile, '| nonApifyJobs:', nonApifyJobCount(jobs), '| nonApifySources:', nonApifySourceCount(jobs), '| apifyJobs:', apifyNaukri)
          for (const query of searchQueries.slice(0, 2)) {
            try {
              const result = await router.searchSource({ title: query, location: profileLocation, countryCode, limit: Math.max(20, targetCount * 2) }, 'apify')
              addUnique(result.jobs)
              sourceErrors.push(...result.errors)
              console.log(`[analyze] Apify last-resource "${query}" → ${result.jobs.length} jobs (total: ${jobs.length}) sources: ${sourceSummary(result.jobs)}`)
              if (jobs.length >= 80 && apifyNaukri >= 10) break
            } catch (err) {
              console.error(`[analyze] Apify last-resource "${query}" error:`, apiErrMsg(err))
            }
            emit({ step: 'jobs_fetching', count: jobs.length, sources: currentSourceNames(jobs) })
          }
        } else {
          console.log('[analyze] Apify skipped — standard sources produced enough candidates and not an India profile')
        }

        if (jobs.length > 0) void setJobSearchCache(admin, user.id, searchCacheHash, jobs)
        } // end !fromJobSearchCache

        jobsFetchedCount = jobs.length
        console.log('[analyze] total jobs fetched:', jobs.length, '| by source:', sourceSummary(jobs))
        console.log(`[PIPELINE_AUDIT] source_fetch_counts=${JSON.stringify(sourceFetchCounts)} total_raw_fetched=${rawFetchedCount} after_deduplication=${jobsFetchedCount}`)
        if (sourceErrors.length) {
          console.warn('[analyze] source errors:', sourceErrors)
        }

        console.log(`[PIPELINE] Total fetched: ${jobs.length}`)

        // ── MANDATORY country filter — runs before scoring, cannot be bypassed ─
        // Competitor bonus in the reranker only applies AFTER this filter passes.
        if (countryCode) {
          const { kept, removed } = filterJobsByCountry(jobs, countryCode)
          jobs.splice(0, jobs.length, ...kept)
          jobsAfterCountryFilter = jobs.length
          console.log(`[PIPELINE] Removed by country filter: ${removed} → ${jobs.length} remaining (filter: ${countryCode})`)
        } else if (isInternational && excludedInternationalCountryCode) {
          const kept = jobs.filter((job) =>
            Boolean(job.location?.trim()) && !jobMentionsCountry(job, excludedInternationalCountryCode)
          )
          const removed = jobs.length - kept.length
          jobs.splice(0, jobs.length, ...kept)
          jobsAfterCountryFilter = jobs.length
          console.log(`[PIPELINE] Removed by international/remote locality filter: ${removed} → ${jobs.length} remaining (excluded=${excludedInternationalCountryCode}, blank_location_removed=true)`)
        } else {
          jobsAfterCountryFilter = jobs.length
          console.log(`[PIPELINE] Removed by country filter: 0 (no country detected — filter skipped)`)
        }

        // ── Advanced relevance filter — role family + seniority + function + industry ─
        const relevanceResult = applyAdvancedRelevanceFilter(jobs, candidateProfile, competitorSet)
        jobs.splice(0, jobs.length, ...relevanceResult.filtered)
        jobsAfterRelevanceFilter = jobs.length
        const reasonStr = Object.entries(relevanceResult.removalReasons).map(([k, v]) => `${k}=${v}`).join(', ')
        console.log(`[PIPELINE] Advanced relevance filter: removed ${relevanceResult.removedCount} → ${jobs.length} remaining (threshold: ${relevanceResult.thresholdUsed || 'fallback'}${relevanceResult.usedFallback ? ', token-overlap fallback' : ''})`)
        console.log(`[PIPELINE] Removal reasons: ${reasonStr || 'none'}`)
        console.log(`[PIPELINE] Candidate profile: family=${candidateProfile.roleFamily ?? 'unknown'}, seniority=${candidateProfile.seniority}, functions=[${candidateProfile.functions.slice(0, 5).join(', ')}], industries=[${candidateProfile.industries.join(', ')}]`)
        for (const s of relevanceResult.removedSamples.slice(0, 12)) {
          console.log(`[RELEVANCE FILTER] Removed: ${s.title}${s.company ? ' at ' + s.company : ''} | Reason: ${s.reason}`)
        }

        // ── Competitor job count (informational — does NOT affect filtering) ────
        const competitorJobsFound = jobs.filter((j) => competitorSet.has(j.company.toLowerCase()))
        const competitorBreakdown: Record<string, number> = {}
        for (const j of competitorJobsFound) {
          competitorBreakdown[j.company] = (competitorBreakdown[j.company] ?? 0) + 1
        }
        const competitorBreakdownStr = Object.entries(competitorBreakdown).map(([co, n]) => `${co}: ${n}`).join(', ')
        console.log(`[PIPELINE] Competitor jobs found: ${competitorJobsFound.length}${competitorBreakdownStr ? ` (${competitorBreakdownStr})` : ''}`)

        if (!jobs.length) {
          if (runId) {
            void admin.from('job_search_runs').update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              generated_queries: searchQueries,
              jobs_fetched_count:          jobsFetchedCount,
              jobs_after_country_filter:   jobsAfterCountryFilter,
              jobs_after_relevance_filter: jobsAfterRelevanceFilter,
              failure_reason: 'no_jobs_found',
              audit_counts: {
                search_engine: 'claude',
                search_run_id: runId,
                generated_queries: searchQueries,
                fetched_count: jobsFetchedCount,
                after_location_filter_count: jobsAfterCountryFilter,
                after_relevance_filter_count: jobsAfterRelevanceFilter,
                final_selected_count: 0,
                final_saved_count: 0,
                failure_reason: 'no_jobs_found',
              },
            }).eq('id', runId)
          }
          emit({
            done: true,
            matchCount: 0,
            cvSuggestions: [],
            message: `No jobs found for "${strategy.search_queries.slice(0, 2).join('" or "')}". Try the search form above with a specific job title and location.`,
          })
          return
        }

        // ── 5. Upsert jobs into the jobs table ───────────────────────────────
        const baseJobRows = jobs.map((j) => ({
          external_id:  j.externalId,
          source:       j.source,
          title:        j.title,
          company:      j.company,
          location:     j.location,
          description:  j.description,
          url:          j.url,
          salary:       j.salary ?? null,
          requirements: {},
          scraped_at:   new Date().toISOString(),
        }))
        const extendedJobRows = jobs.map((j, i) => ({
          ...baseJobRows[i],
          apply_url:    j.applyUrl ?? j.url,
          apply_status: 'unverified',
        }))

        let { data: dbJobs, error: upsertErr } = await admin
          .from('jobs')
          .upsert(extendedJobRows, { onConflict: 'external_id,source' })
          .select('id, external_id, source')
        if (upsertErr && (upsertErr.code === '42703' || upsertErr.code === 'PGRST204' || upsertErr.message?.includes('apply_url'))) {
          console.warn('[analyze] migration pending — retrying upsert without new columns')
          ;({ data: dbJobs, error: upsertErr } = await admin
            .from('jobs')
            .upsert(baseJobRows, { onConflict: 'external_id,source' })
            .select('id, external_id, source'))
        }
        if (upsertErr) {
          console.error('[analyze] jobs upsert error:', upsertErr.message)
          throw new Error(`Could not save fetched jobs: ${upsertErr.message}`)
        }
        if (!dbJobs?.length) {
          console.error('[analyze] jobs upsert returned no rows')
          throw new Error('Fetched jobs were not returned from storage. Please try again.')
        }

        const extToDbId = new Map((dbJobs ?? []).map((j) => [`${j.source}:${j.external_id}`, j.id]))

        // ── 6. Select scoring pool ────────────────────────────────────────────
        const jobsForScoring = selectScoringPool(jobs, parsedResume, searchQueries, Math.max(160, targetCount * 10))
        jobsScoredCount = jobsForScoring.length
        console.log('[analyze] scoring candidate pool:', jobsForScoring.length, 'of', jobs.length, 'stored jobs | by source:', sourceSummary(jobsForScoring))
        console.log(`[PIPELINE] Jobs sent to reranker: ${jobsForScoring.length} (competitor boost active for ${allCompetitors.length} companies)`)

        emit({ step: 'pool_selected', count: jobsForScoring.length })

        // ── 7. AI batch reranking ─────────────────────────────────────────────
        emit({ step: 'ai_ranking' })

        let ranked
        try {
          ranked = await rerankJobs(parsedResume, jobsForScoring, resume.raw_text ?? undefined, allCompetitors, user.id, !isPro)
          console.log('[analyze] rerank complete, top score:', ranked[0]?.score, '| ranked by source:', sourceSummary(ranked))
        } catch (err) {
          const msg = apiErrMsg(err)
          console.error('[analyze] rerank failed — falling back to heuristic scoring:', msg)
          // Fallback: score jobs by keyword overlap so the run still produces results
          const resumeSkills = new Set((parsedResume.skills ?? []).map((s) => s.toLowerCase()))
          ranked = jobsForScoring.map((job) => {
            const text = `${job.title} ${job.description ?? ''}`.toLowerCase()
            const matched = [...resumeSkills].filter((s) => text.includes(s))
            const score = Math.min(75, 40 + matched.length * 3)
            return {
              externalId:    job.externalId,
              source:        job.source,
              score,
              reasoning:     'Scored by keyword overlap (AI ranking unavailable)',
              bridge_advice: '',
              match_reasons: matched.slice(0, 3),
              matched_skills: matched,
              missing_skills: [],
            }
          }).sort((a, b) => b.score - a.score)
        }

        const jobMap = new Map(jobsForScoring.map((j) => [`${j.source}:${j.externalId}`, j]))

        // Build the quota-sized display set by scanning all ranked jobs and keeping
        // only high-scoring jobs. Scores below MIN_DISPLAY_SCORE are never saved
        // as visible matches; if fewer than targetCount qualify, the run records an
        // explicit scarcity reason instead of silently filling with weak jobs.
        const selection = selectDisplayMatches({ ranked, jobMap, targetCount, countryCode })
        const top20 = selection.selected
        if (selection.skippedLocation.length > 0) {
          console.log(`[PIPELINE] pre-save location filter skipped ${selection.skippedLocation.length} non-${countryCode} jobs: ${selection.skippedLocation.slice(0, 5).join('; ')}`)
        }
        if (selection.skippedLowScore > 0) {
          console.log(`[PIPELINE] pre-save score filter skipped ${selection.skippedLowScore} jobs below ${MIN_DISPLAY_SCORE}`)
        }
        console.log(`[PIPELINE] pre-save valid jobs: ${top20.length} of ${ranked.length} ranked passed scope and score>=${MIN_DISPLAY_SCORE}`)
        console.log(`[PIPELINE] final quota selection: kept ${top20.length}/${targetCount} displayable jobs`)
        const highScoreRankedCount = ranked.filter((r) => r.score >= MIN_DISPLAY_SCORE).length
        const scarcityReason = top20.length >= targetCount
          ? null
          : `only_${top20.length}_of_${targetCount}_jobs_scored_${MIN_DISPLAY_SCORE}_plus_after_all_sources_backfill_and_filters`

        console.log(`[analyze] resume_id=${resume.id} jobs_fetched=${jobs.length} jobs_scored=${jobsForScoring.length} jobs_ranked=${ranked.length} unified_top20_scores=${top20.map((r) => r.score).join(',')} unified_top20_sources=${sourceSummary(top20)}`)
        if (scarcityReason) {
          console.warn(`[PIPELINE] scarcity: ${scarcityReason} | high_score_ranked=${highScoreRankedCount} | ranked=${ranked.length} | fetched=${jobsFetchedCount}`)
        }

        const scores = top20.map((r) => r.score)
        const scoreDist = `90+=${scores.filter((s) => s >= 90).length}, 80-89=${scores.filter((s) => s >= 80 && s < 90).length}, 70-79=${scores.filter((s) => s >= 70 && s < 80).length}, <70=${scores.filter((s) => s < 70).length}`
        const topCompanies = top20.map((r) => jobMap.get(`${r.source}:${r.externalId}`)?.company).filter(Boolean).slice(0, 5).join(', ')
        const lowestScore  = scores.length ? Math.min(...scores) : 0
        console.log(`[PIPELINE] Score distribution: ${scoreDist}`)
        console.log(`[PIPELINE] Top saved companies: ${topCompanies || 'none'}`)
        console.log(`[PIPELINE] Lowest saved score: ${lowestScore}`)
        console.log(
          `[PIPELINE_AUDIT] fetched=${jobsFetchedCount}` +
          ` target=${targetCount}` +
          ` deduped=${jobsFetchedCount}` +
          ` location-filtered=${jobsAfterCountryFilter}` +
          ` relevance-filtered=${jobsAfterRelevanceFilter}` +
          ` scored=${jobsScoredCount}` +
          ` high-score-ranked=${highScoreRankedCount}` +
          ` selected=${top20.length}`
        )

        // ── 8. Build fresh match rows (tagged with runId) ─────────────────────
        // No hard delete — the matches API will filter by the latest successful
        // run, so previous runs' matches are naturally superseded. Old matches
        // are cleaned up by periodic maintenance (migration 030 cleanup logic).
        const matchRows = top20
          .map((r, index) => {
            const job = jobMap.get(rankedKey(r))
            if (!job) return null
            const dbJobId = extToDbId.get(`${job.source}:${job.externalId}`)
            if (!dbJobId) return null
            const displaySnapshot = {
              id:             '',
              ai_score:       r.score,
              ai_reasoning:   r.reasoning,
              bridge_advice:  r.bridge_advice ?? '',
              match_reasons:  r.match_reasons ?? [],
              matched_skills: r.matched_skills ?? [],
              missing_skills: r.missing_skills ?? [],
              rank_position:  index + 1,
              job: {
                id:             dbJobId,
                title:          job.title ?? '',
                company:        job.company ?? '',
                location:       job.location ?? '',
                url:            job.url ?? '',
                apply_url:      job.applyUrl ?? job.url ?? '',
                apply_status:   'unverified',
                verified_label: 'unverified',
                salary:         job.salary ?? null,
                source:         job.source,
                description:    job.description ?? '',
                created_at:     job.postedAt ?? new Date().toISOString(),
              },
            }
            return {
              user_id:          user.id,
              job_id:           dbJobId,
              similarity_score: r.score / 100,
              ai_score:         r.score,
              ai_reasoning:     JSON.stringify({ r: r.reasoning, bridge: r.bridge_advice ?? '', mr: r.match_reasons ?? [], ms: r.matched_skills ?? [], miss: r.missing_skills ?? [] }),
              rank_position:    index + 1,
              display_snapshot: displaySnapshot,
              ...(runId ? { search_run_id: runId } : {}),
            }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)

        console.log(`[PIPELINE] Final saved jobs: ${matchRows.length}`)
        console.log(`[PIPELINE_AUDIT] final_selected_count=${top20.length} final_saved_count=${matchRows.length} final_displayed_count=${Math.min(matchRows.length, targetCount)} reason_if_below_target=${scarcityReason ?? 'none'}`)
        console.log(`[PIPELINE_AUDIT] saved=${matchRows.length}`)
        console.log(`[analyze] inserting ${matchRows.length} fresh match rows | run_id=${runId ?? 'none'}`)

        // Save match rows — handles two DB states:
        //  • Pre-migration 031: UNIQUE(user_id,job_id) exists → use upsert so existing rows get
        //    updated with the new search_run_id instead of throwing a duplicate-key error.
        //  • Post-migration 031: that constraint was dropped in favour of a partial index on
        //    (search_run_id, job_id). The upsert would fail with "no unique constraint" so we
        //    fall back to plain insert (safe because each run has a fresh runId).
        async function saveMatchRows() {
          if (matchRows.length === 0) return { error: null }
          const upsertRes = await admin
            .from('job_matches')
            .upsert(matchRows, { onConflict: 'user_id,job_id' })
          if (!upsertRes.error) return upsertRes
          const isConstraintGone =
            upsertRes.error.code === '42P10' ||
            /no unique or exclusion constraint/i.test(upsertRes.error.message ?? '')
          if (isConstraintGone) {
            console.warn('[analyze] UNIQUE(user_id,job_id) gone (migration 031 applied) — falling back to insert')
            return admin.from('job_matches').insert(matchRows)
          }
          return upsertRes
        }
        const [matchResult, cvSuggestions] = await Promise.all([
          saveMatchRows(),
          generateCvSuggestions(
            parsedResume,
            top20.map((r) => ({
              title:          jobMap.get(rankedKey(r))?.title ?? '',
              matched_skills: r.matched_skills ?? [],
              missing_skills: r.missing_skills ?? [],
            })),
            user.id,
            !isPro,
          ),
        ])

        const runCounts = {
          detected_location:           isInternational ? 'international_remote' : (detectedLocation.countryName || null),
          search_mode:                 isInternational ? 'international_remote' : 'country',
          country_code:                isInternational ? null : (searchCountryCode || null),
          country_name:                isInternational ? null : (detectedLocation.countryName || null),
          generated_queries:           searchQueries,
          jobs_fetched_count:          jobsFetchedCount,
          jobs_after_country_filter:   jobsAfterCountryFilter,
          jobs_after_relevance_filter: jobsAfterRelevanceFilter,
          jobs_scored_count:           jobsScoredCount,
          final_selected_count:        top20.length,
          final_saved_count:           matchRows.length,
          failure_reason:              scarcityReason,
          audit_counts: {
            search_engine: 'claude',
            search_run_id: runId,
            generated_queries: searchQueries,
            fetched_count: jobsFetchedCount,
            after_location_filter_count: jobsAfterCountryFilter,
            after_relevance_filter_count: jobsAfterRelevanceFilter,
            final_selected_count: top20.length,
            final_saved_count: matchRows.length,
            failure_reason: scarcityReason,
            fetched: jobsFetchedCount,
            source_fetch_counts: sourceFetchCounts,
            total_raw_fetched: rawFetchedCount,
            target_count: targetCount,
            user_plan: planTier,
            deduped: jobsFetchedCount,
            location_filtered: jobsAfterCountryFilter,
            relevance_filtered: jobsAfterRelevanceFilter,
            scored: jobsScoredCount,
            high_score_ranked: highScoreRankedCount,
            selected: top20.length,
            saved: matchRows.length,
            returned: Math.min(matchRows.length, targetCount),
            displayed: Math.min(matchRows.length, targetCount),
            reason_if_below_target: scarcityReason,
          },
          completed_at:                new Date().toISOString(),
        }

        if (matchResult.error) {
          console.error('[analyze] match insert error:', matchResult.error.message)
          if (runId) {
            await admin.from('job_search_runs').update({
              status: 'failed', ...runCounts,
            }).eq('id', runId)
          }
          throw new Error(`Failed to save job matches: ${matchResult.error.message}`)
        } else if (matchRows.length === 0 && jobsFetchedCount > 0) {
          // Jobs were fetched but none survived scoring/mapping — bad UX to call this success
          console.warn(`[analyze] run completed with zero saved matches (fetched=${jobsFetchedCount}) — marking failed/no_relevant_matches | run=${runId}`)
          if (runId) {
            await admin.from('job_search_runs').update({
              status: 'failed', ...runCounts, failure_reason: 'no_relevant_matches',
            }).eq('id', runId)
          }
        } else if (runId) {
          // Await so the run is marked success before the frontend's mutate() queries it
          await admin.from('job_search_runs').update({
            status: 'success', ...runCounts,
          }).eq('id', runId)
        }

        if (cvSuggestions.length > 0) {
          const { error: cvUpdateErr } = await admin
            .from('resumes')
            .update({ parsed_data: { ...parsedResume, cv_suggestions: cvSuggestions } })
            .eq('id', resume.id)
          if (cvUpdateErr) {
            console.error('[analyze] cv_suggestions update failed (non-fatal):', cvUpdateErr.message)
          }
        }

        console.log(`[analyze] done — resume_id=${resume.id} saved=${matchRows.length} matches`)

        emit({ step: 'matches_saved' })

        // Deduct credits after successful rerank + match save
        const afterCredits = await deductCredits(user.id, 'jobRerank', admin)

        await createNotification({
          userId: user.id,
          type: 'jobs',
          title: `${matchRows.length} new job${matchRows.length !== 1 ? 's' : ''} matching your profile`,
          body: 'Your resume was analysed and top matches have been ranked for you.',
          ctaLabel: 'View Jobs',
          ctaHref: '/matches',
        })

        const returnedMatchCount = Math.min(matchRows.length, targetCount)
        emit({
          done: true,
          matchCount:       returnedMatchCount,
          cvSuggestions,
          detectedCountry:  isInternational ? 'International / Remote' : (detectedLocation.countryName || undefined),
          detectedCity:     undefined,  // city not relevant when user chose at country level
          creditCost,
          creditsRemaining: afterCredits?.remainingCredits,
          searchRunId:      runId,
          searchScope: {
            searchMode:  isInternational ? 'international_remote' : 'country',
            countryCode: isInternational ? null : (searchCountryCode || null),
            countryName: isInternational ? null : (detectedLocation.countryName || null),
            searchRunId: runId,
          },
          counts: {
            fetched: jobsFetchedCount,
            target: targetCount,
            sourceFetchCounts,
            totalRawFetched: rawFetchedCount,
            deduped: jobsFetchedCount,
            locationFiltered: jobsAfterCountryFilter,
            relevanceFiltered: jobsAfterRelevanceFilter,
            scored: jobsScoredCount,
            selected: top20.length,
            saved: matchRows.length,
            returned: returnedMatchCount,
            displayed: returnedMatchCount,
            reasonIfBelowTarget: scarcityReason,
          },
          scarcityReason,
        })

        // Persist composite analysis key (resume hash + search country) so subsequent
        // identical resume+country combinations hit the cache, while a different country
        // on the same resume correctly misses and triggers a fresh pipeline.
        if (compositeAnalysisKey) {
          void admin.from('profiles')
            .update({ last_analyzed_resume_hash: compositeAnalysisKey })
            .eq('user_id', user.id)
        }

        // Increment re-analyze count for free users (non-fatal)
        if (!isPro) {
          void admin.from('profiles')
            .update({ ai_reanalyze_count: currentReanalyzeCount + 1 })
            .eq('user_id', user.id)
        }

      } catch (err) {
        const msg = apiErrMsg(err)
        console.error('[analyze] stream error:', msg)
        emit({ error: msg })
        // Mark the run as failed so it is never returned by the matches API
        if (runId) {
          void admin.from('job_search_runs').update({
            status: 'failed',
            completed_at: new Date().toISOString(),
          }).eq('id', runId)
        }
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
