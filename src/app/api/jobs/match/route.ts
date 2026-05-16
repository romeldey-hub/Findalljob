import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { computeVerifiedLabel }     from '@/types'
import { isProUser }                from '@/lib/admin'
import { resolveProUntil }          from '@/lib/billing'
import { FREE_LIMITS }              from '@/lib/limits'
import { detectLocation } from '@/lib/jobs/location'
import { computeParsedResumeHash }  from '@/lib/resume-hash'
import type { ApplyStatus, ParsedResume } from '@/types'

// Maps the ISO-2 country code sent by the frontend to the human-readable
// detected_location value stored in job_search_runs (e.g. "in" → "India").
const CC_TO_LOCATION: Record<string, string> = {
  in: 'India',
  gb: 'United Kingdom',
  us: 'United States',
  au: 'Australia',
  ca: 'Canada',
  de: 'Germany',
  fr: 'France',
  nl: 'Netherlands',
  sg: 'Singapore',
  ae: 'UAE',
  nz: 'New Zealand',
  za: 'South Africa',
}

function decodeReasoning(raw: string): {
  reasoning:      string
  bridge_advice:  string
  match_reasons:  string[]
  matched_skills: string[]
  missing_skills: string[]
} {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && typeof parsed.r === 'string') {
      return {
        reasoning:      parsed.r,
        bridge_advice:  typeof parsed.bridge === 'string' ? parsed.bridge : '',
        match_reasons:  Array.isArray(parsed.mr)   ? parsed.mr   : [],
        matched_skills: Array.isArray(parsed.ms)   ? parsed.ms   : [],
        missing_skills: Array.isArray(parsed.miss) ? parsed.miss : [],
      }
    }
  } catch { /* plain string fallback */ }
  return { reasoning: raw, bridge_advice: '', match_reasons: [], matched_skills: [], missing_skills: [] }
}

function isColumnError(code?: string, msg?: string): boolean {
  if (code === '42703' || code === 'PGRST204') return true
  if (msg?.includes('apply_url') || msg?.includes('apply_status') || msg?.includes('last_verified_at')) return true
  return false
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = user.id

  // Country code sent by the client, e.g. "in", "us", "gb", or
  // "international_remote". When present, the run lookup is exact.
  const cc = new URL(req.url).searchParams.get('cc') ?? ''

  // Resolve Pro status — used to determine match cap
  const admin = createAdminClient()
  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until, location')
    .eq('user_id', user.id)
    .single()
  const effectiveProUntil = await resolveProUntil(
    admin, user.id, profileRow?.subscription_status, profileRow?.pro_until
  )
  const isPro = isProUser(user.email, profileRow?.role, profileRow?.subscription_status, effectiveProUntil)
  const matchLimit = isPro ? 20 : FREE_LIMITS.matchesPerDay

  // Fetch active resume — needed for resume_hash identity check (prevents stale
  // matches from a previous resume surfacing for a new one).
  const resumeResult = await supabase
    .from('resumes')
    .select('id, parsed_data')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const parsedData    = resumeResult.data?.parsed_data as ParsedResume | null
  const activeResumeId = resumeResult.data?.id ?? null
  const hasResume      = Boolean(activeResumeId)
  const cvSuggestions  = Array.isArray((parsedData as unknown as Record<string, unknown> | null)?.cv_suggestions)
    ? ((parsedData as unknown as Record<string, unknown>).cv_suggestions as string[])
    : []

  // Compute the stable content hash for the active resume.
  // job_search_runs.resume_hash is set to this value when a run is created,
  // so filtering by it ensures only runs for THIS resume are returned.
  const activeResumeHash = parsedData?.name ? computeParsedResumeHash(parsedData) : null

  const cacheKey = activeResumeHash
    ? `${activeResumeHash}:${cc || 'any'}`
    : null

  console.log(
    `[jobs/match] identity | user=${userId}` +
    ` | resume_id=${activeResumeId ?? 'none'}` +
    ` | resume_hash=${activeResumeHash ?? 'none'}` +
    ` | cache_key=${cacheKey ?? 'none'}` +
    ` | cc=${cc || 'any'}`
  )

  const requestedScope = cc === 'international_remote'
    ? { searchMode: 'international_remote' as const, countryCode: null, countryName: null }
    : cc
      ? { searchMode: 'country' as const, countryCode: cc, countryName: CC_TO_LOCATION[cc] ?? cc }
      : null

  function scopedRunQuery() {
    let query = admin
      .from('job_search_runs')
      .select('id, search_mode, country_code, country_name, detected_location, generated_queries, final_saved_count, failure_reason, audit_counts')
      .eq('user_id', userId)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)

    // CRITICAL: only return runs for the current resume's content hash.
    // Without this filter, uploading a new resume would still show matches
    // from a previous (different) resume that happened to share the same user_id.
    if (activeResumeHash) {
      query = query.eq('resume_hash', activeResumeHash)
    }

    if (requestedScope) {
      query = query.eq('search_mode', requestedScope.searchMode)
      query = requestedScope.countryCode
        ? query.eq('country_code', requestedScope.countryCode)
        : query.is('country_code', null)
    }
    return query
  }

  // Prefer the latest complete run. If a later partial/scarce run exists, it
  // must not hide an older complete run for the same exact scope.
  const completeRunQuery = scopedRunQuery().gte('final_saved_count', matchLimit)
  const { data: completeRunRow, error: completeRunError } = await completeRunQuery.maybeSingle()
  if (completeRunError) {
    console.error('[jobs/match] complete run lookup failed:', completeRunError.message)
  }

  const runQuery = scopedRunQuery()
  const { data: fallbackRunRow, error: runError } = await runQuery.maybeSingle()

  const runRow = completeRunRow ?? fallbackRunRow
  if (runError) {
    console.error('[jobs/match] run lookup failed:', runError.message)
    return NextResponse.json({ matches: [], cvSuggestions, hasResume, needsNewSearch: true })
  }

  if (!runRow?.id) {
    const runCountryCode = requestedScope?.searchMode === 'international_remote'
      ? 'international_remote'
      : requestedScope?.countryCode ?? null
    const runCountryName = requestedScope?.searchMode === 'international_remote'
      ? 'International / Remote'
      : requestedScope?.countryName ?? null
    console.log(`[jobs/match] no successful run for exact scope=${requestedScope ? `${requestedScope.searchMode}:${requestedScope.countryCode ?? 'remote'}` : 'latest'}`)
    return NextResponse.json({
      matches: [],
      cvSuggestions,
      hasResume,
      isPro,
      matchLimit,
      totalMatches: 0,
      returnedCount: 0,
      needsNewSearch: true,
      runCountryCode,
      runCountryName,
      searchScope: requestedScope
        ? { ...requestedScope, searchRunId: null }
        : null,
    })
  }

  const latestRunId = runRow.id as string
  const runMode = (runRow.search_mode as 'country' | 'international_remote' | null)
    ?? (runRow.detected_location === 'international_remote' ? 'international_remote' : 'country')
  const runCountryCode = runMode === 'international_remote'
    ? 'international_remote'
    : ((runRow.country_code as string | null) ?? detectLocation((runRow.country_name ?? runRow.detected_location ?? '') as string).countryCode)
  const runCountryName = runMode === 'international_remote'
    ? 'International / Remote'
    : ((runRow.country_name as string | null) ?? CC_TO_LOCATION[runCountryCode ?? ''] ?? null)

  console.log(
    `[jobs/match] run selected | run=${latestRunId}` +
    ` | resume_hash=${activeResumeHash ?? 'none'}` +
    ` | scope=${runMode}:${runCountryCode ?? 'remote'}` +
    ` | source=db_cache`
  )

  // Build the matches query from the exact run, ordered by immutable rank.
  const matchesQuery = supabase
    .from('job_matches')
    .select(`
      id, similarity_score, ai_score, ai_reasoning, created_at, rank_position, display_snapshot,
      job:jobs (
        id, title, company, location, description,
        url, apply_url, apply_status, last_verified_at,
        salary, source, created_at
      )
    `)
    .eq('user_id', user.id)
    .eq('search_run_id', latestRunId)
    .gte('ai_score', 40)
    .order('rank_position', { ascending: true, nullsFirst: false })
    .order('ai_score', { ascending: false })
    .limit(20)

  const matchesResult = await matchesQuery

  // Resolve raw match rows — fall back to base schema if new columns aren't in DB yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawMatches: any[] | null = matchesResult.data
  if (matchesResult.error) {
    if (isColumnError(matchesResult.error.code, matchesResult.error.message)) {
      console.warn('[jobs/match] optional jobs columns unavailable — retrying with scoped snapshot columns and base job fields')
      const fallbackQuery = supabase
        .from('job_matches')
        .select(`
          id, similarity_score, ai_score, ai_reasoning, created_at, rank_position, display_snapshot,
          job:jobs (
            id, title, company, location, description,
            url, salary, source, created_at
          )
        `)
        .eq('user_id', user.id)
        .eq('search_run_id', latestRunId)
        .gte('ai_score', 40)
        .order('rank_position', { ascending: true, nullsFirst: false })
        .order('ai_score', { ascending: false })
        .limit(20)
      const fallback = await fallbackQuery

      if (fallback.error) {
        console.error('[jobs/match] fallback select failed:', fallback.error.message)
        return NextResponse.json({ matches: [], cvSuggestions, hasResume })
      }
      rawMatches = fallback.data
    } else {
      console.error('[jobs/match] select error:', matchesResult.error.message)
      return NextResponse.json({ matches: [], cvSuggestions, hasResume })
    }
  }

  const matches = (rawMatches ?? []).map((m) => {
    const snapshot = m.display_snapshot as Record<string, unknown> | null
    if (snapshot && typeof snapshot === 'object' && snapshot.job) {
      return {
        ...snapshot,
        id: m.id,
        rank_position: m.rank_position ?? snapshot.rank_position,
      }
    }

    const decoded = decodeReasoning(m.ai_reasoning ?? '')
    const job = m.job as unknown as Record<string, unknown> | null

    const applyStatus    = (job?.apply_status    as ApplyStatus | undefined)
    const lastVerifiedAt = (job?.last_verified_at as string | null | undefined)
    const verified_label = computeVerifiedLabel(applyStatus, lastVerifiedAt)

    return {
      ...m,
      ai_reasoning:   decoded.reasoning,
      bridge_advice:  decoded.bridge_advice,
      match_reasons:  decoded.match_reasons,
      matched_skills: decoded.matched_skills,
      missing_skills: decoded.missing_skills,
      job: {
        ...job,
        verified_label,
      },
    }
  })
  console.log(
    `[jobs/match] matches loaded | count=${matches.length}` +
    ` | run=${latestRunId}` +
    ` | resume_hash=${activeResumeHash ?? 'none'}` +
    ` | source=db_cache`
  )

  const visibleMatches = isPro ? matches : matches.slice(0, matchLimit)
  console.log(`[jobs/match] displayed=${visibleMatches.length} | run=${latestRunId} | resume_hash=${activeResumeHash ?? 'none'}`)
  return NextResponse.json({
    matches:        visibleMatches,
    cvSuggestions,
    hasResume,
    isPro,
    matchLimit,
    totalMatches:   matches.length,
    returnedCount:  visibleMatches.length,
    needsNewSearch: false,
    searchRunId:    latestRunId,
    searchEngine:   'claude',
    generatedQueries: runRow.generated_queries ?? null,
    searchScope: {
      searchMode: runMode,
      countryCode: runMode === 'international_remote' ? null : runCountryCode,
      countryName: runMode === 'international_remote' ? null : runCountryName,
      searchRunId: latestRunId,
    },
    auditCounts: runRow.audit_counts ?? null,
    scarcityReason: runRow.failure_reason ?? null,
    runCountryCode,
    runCountryName,
  })
}
