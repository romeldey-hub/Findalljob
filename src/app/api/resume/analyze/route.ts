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
import { detectLocation, filterJobsByCountry } from '@/lib/jobs/location'
import { buildCandidateProfile, applyAdvancedRelevanceFilter } from '@/lib/jobs/relevance'
import { hashSearchParams, getJobSearchCache, setJobSearchCache } from '@/lib/cache'
import type { ParsedResume, NormalizedJob } from '@/types'
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

function selectUnifiedTop(ranked: RankedJob[], limit = 20): RankedJob[] {
  const bySource = new Map<string, RankedJob[]>()
  const competitive = ranked.filter((job) => job.score >= 40)
  const sourcePool = competitive.length > 0 ? competitive : ranked

  for (const job of sourcePool) {
    const bucket = bySource.get(job.source) ?? []
    bucket.push(job)
    bySource.set(job.source, bucket)
  }

  if (bySource.size <= 1) return ranked.slice(0, limit)

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

  // If some providers have too few relevant jobs, fill the remaining slots by
  // pure score so the page still shows 20 matches when enough jobs exist.
  for (const job of ranked) {
    if (selected.length >= limit) break
    if (selectedKeys.has(rankedKey(job))) continue
    selected.push(job)
    selectedKeys.add(rankedKey(job))
  }

  return selected.sort((a, b) => b.score - a.score)
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
  | { done: true; matchCount: number; cvSuggestions: string[]; message?: string; detectedCountry?: string; detectedCity?: string; cached?: boolean; creditCost?: number; creditsRemaining?: number }
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

  // ── Read force flag ───────────────────────────────────────────────────────
  let force = false
  try {
    const body = await req.json().catch(() => ({}))
    force = Boolean(body?.force)
  } catch { /* no body — treat as non-forced */ }

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
  const currentReanalyzeCount = profileRow?.ai_reanalyze_count ?? 0
  const lastAnalyzedHash = profileRow?.last_analyzed_resume_hash ?? ''

  if (!isPro && currentReanalyzeCount >= FREE_LIMITS.aiReanalyze) {
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

  // ── Cache check: skip AI pipeline if resume unchanged and matches exist ────
  const currentHash = (resume as Record<string, unknown>).resume_hash as string | null
  if (!force && currentHash && currentHash === lastAnalyzedHash) {
    const { count } = await admin
      .from('job_matches')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if ((count ?? 0) > 0) {
      const encoder = new TextEncoder()
      const cachedStream = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ step: 'resume_loaded' })}\n\n`))
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, matchCount: count, cvSuggestions: [], cached: true })}\n\n`))
          ctrl.close()
        },
      })
      return new Response(cachedStream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' },
      })
    }
  }

  // ── Credit check: deep job rerank costs 1 credit (skip for cached responses) ─
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

      try {
        emit({ step: 'resume_loaded' })

        // ── 2. Parse resume if not already done ──────────────────────────────
        let parsedResume = resume.parsed_data as ParsedResume
        if (!parsedResume?.name) {
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
        const profileLocation = parsedResume.location?.trim() || 'India'

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

        const cleanedQueries = strategy.search_queries
          .map(sanitizeQuery)
          .filter((q) => q.length > 2)

        const primaryQuery = cleanedQueries[0] ?? (parsedResume.experience?.[0]?.title?.trim().replace(/[/\\|&"'()]/g, ' ').trim() || 'software engineer')

        const detectedLocation = detectLocation(profileLocation)
        const countryCode: string | undefined = detectedLocation.countryCode || undefined
        const isIndiaProfile = detectedLocation.countryCode === 'in'
        console.log('[analyze] profile location:', profileLocation, '| detected country:', detectedLocation.countryName, '(', countryCode ?? 'unknown', ') | source mode: all-sources-top20')
        console.log('[analyze] cleaned queries:', cleanedQueries)
        console.log(`[PIPELINE] Resume country: ${detectedLocation.countryName || 'Unknown'} (${countryCode ?? 'none'})`)

        emit({ step: 'strategy_ready' })

        // ── 4. Fetch jobs via multi-source router ─────────────────────────────
        const router = new JobSourceRouter()
        const jobs: NormalizedJob[] = []
        const seenKeys = new Set<string>()

        function addUnique(incoming: NormalizedJob[]) {
          for (const job of incoming) {
            const key = `${job.source}:${job.externalId}`
            if (!seenKeys.has(key)) {
              seenKeys.add(key)
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
        console.log(`[PIPELINE] Competitor companies: direct=[${strategy.competitors?.direct?.join(', ') ?? ''}] adjacent=[${strategy.competitors?.adjacent?.join(', ') ?? ''}]`)

        // Emit initial jobs_fetching to signal search has started
        emit({ step: 'jobs_fetching', count: 0, sources: [] })

        // ── Job search cache check — skip external API calls on recent hit ────
        const searchCacheHash = hashSearchParams(searchQueries, profileLocation)
        let fromJobSearchCache = false
        if (!force) {
          const cachedJobs = await getJobSearchCache(admin, user.id, searchCacheHash)
          if (cachedJobs && cachedJobs.length > 0) {
            addUnique(cachedJobs)
            fromJobSearchCache = true
            console.log('[analyze] job search cache hit:', jobs.length, 'cached jobs')
            emit({ step: 'jobs_fetching', count: jobs.length, sources: currentSourceNames(jobs) })
          }
        }

        if (!fromJobSearchCache) {
        console.log('[analyze] competitor intelligence — direct:', strategy.competitors?.direct ?? [], '| adjacent:', strategy.competitors?.adjacent ?? [])

        // 4a. Fetch every configured source — run all strategy queries (up to 8)
        for (const query of searchQueries.slice(0, 8)) {
          console.log('[analyze] strategy query:', query, '| source mode: standard')
          try {
            const result = await router.searchAllForScoring({ title: query, location: profileLocation, countryCode, limit: 25 })
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
              const result = await router.searchSource({ title: query, location: '', countryCode, limit: 25 }, 'adzuna')
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
        if (jobs.length < 20) {
          console.log('[analyze] trying without location restriction')
          for (const query of searchQueries.slice(0, 3)) {
            if (jobs.length >= 20) break
            try {
              const r = await router.searchAllForScoring({ title: query, location: '', countryCode, limit: 25 })
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
              const result = await router.searchAllForScoring({ title: companyQuery, location: profileLocation, countryCode, limit: 15 })
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
              const result = await router.searchAllForScoring({ title: companyQuery, location: profileLocation, countryCode, limit: 15 })
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
              const result = await router.searchSource({ title: query, location: profileLocation, countryCode, limit: 20 }, 'apify')
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

        console.log('[analyze] total jobs fetched:', jobs.length, '| by source:', sourceSummary(jobs))
        if (sourceErrors.length) {
          console.warn('[analyze] source errors:', sourceErrors)
        }

        console.log(`[PIPELINE] Total fetched: ${jobs.length}`)

        // ── MANDATORY country filter — runs before scoring, cannot be bypassed ─
        // Competitor bonus in the reranker only applies AFTER this filter passes.
        if (countryCode) {
          const { kept, removed } = filterJobsByCountry(jobs, countryCode)
          jobs.splice(0, jobs.length, ...kept)
          console.log(`[PIPELINE] Removed by country filter: ${removed} → ${jobs.length} remaining (filter: ${countryCode})`)
        } else {
          console.log(`[PIPELINE] Removed by country filter: 0 (no country detected — filter skipped)`)
        }

        // ── Advanced relevance filter — role family + seniority + function + industry ─
        const relevanceResult = applyAdvancedRelevanceFilter(jobs, candidateProfile, competitorSet)
        jobs.splice(0, jobs.length, ...relevanceResult.filtered)
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
        const jobsForScoring = selectScoringPool(jobs, parsedResume, searchQueries, 60)
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
          console.error('[analyze] rerank failed:', msg)
          throw new Error(`AI matching failed: ${msg}`)
        }

        const jobMap = new Map(jobsForScoring.map((j) => [`${j.source}:${j.externalId}`, j]))
        const top20 = selectUnifiedTop(ranked, 20)

        console.log(`[analyze] resume_id=${resume.id} jobs_fetched=${jobs.length} jobs_scored=${jobsForScoring.length} jobs_ranked=${ranked.length} unified_top20_scores=${top20.map((r) => r.score).join(',')} unified_top20_sources=${sourceSummary(top20)}`)

        const scores = top20.map((r) => r.score)
        const scoreDist = `90+=${scores.filter((s) => s >= 90).length}, 80-89=${scores.filter((s) => s >= 80 && s < 90).length}, 70-79=${scores.filter((s) => s >= 70 && s < 80).length}, <70=${scores.filter((s) => s < 70).length}`
        const topCompanies = top20.map((r) => jobMap.get(`${r.source}:${r.externalId}`)?.company).filter(Boolean).slice(0, 5).join(', ')
        const lowestScore  = scores.length ? Math.min(...scores) : 0
        console.log(`[PIPELINE] Score distribution: ${scoreDist}`)
        console.log(`[PIPELINE] Top saved companies: ${topCompanies || 'none'}`)
        console.log(`[PIPELINE] Lowest saved score: ${lowestScore}`)

        // ── 8. Hard-delete ALL previous matches for this user ─────────────────
        const { error: deleteError } = await admin
          .from('job_matches')
          .delete()
          .eq('user_id', user.id)
        if (deleteError) console.error('[analyze] stale match delete error:', deleteError.message)
        else console.log('[analyze] cleared previous matches for user', user.id)

        // ── 9. Build fresh match rows ─────────────────────────────────────────
        const matchRows = top20
          .map((r) => {
            const job = jobMap.get(rankedKey(r))
            if (!job) return null
            const dbJobId = extToDbId.get(`${job.source}:${job.externalId}`)
            if (!dbJobId) return null
            return {
              user_id:          user.id,
              job_id:           dbJobId,
              similarity_score: r.score / 100,
              ai_score:         r.score,
              ai_reasoning:     JSON.stringify({ r: r.reasoning, bridge: r.bridge_advice ?? '', mr: r.match_reasons ?? [], ms: r.matched_skills ?? [], miss: r.missing_skills ?? [] }),
            }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)

        console.log(`[PIPELINE] Final saved jobs: ${matchRows.length}`)
        console.log(`[analyze] inserting ${matchRows.length} fresh match rows (score >= filter applied client-side)`)

        const [matchResult, cvSuggestions] = await Promise.all([
          matchRows.length > 0
            ? admin.from('job_matches').insert(matchRows)
            : Promise.resolve({ error: null }),
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

        if (matchResult.error) {
          console.error('[analyze] match insert error:', matchResult.error.message)
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

        emit({
          done: true,
          matchCount:       matchRows.length,
          cvSuggestions,
          detectedCountry:  detectedLocation.countryName || undefined,
          detectedCity:     detectedLocation.city        || undefined,
          creditCost,
          creditsRemaining: afterCredits?.remainingCredits,
        })

        // Persist resume hash so subsequent identical-resume runs hit the cache
        if (currentHash) {
          void admin.from('profiles')
            .update({ last_analyzed_resume_hash: currentHash })
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
