import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { computeVerifiedLabel }     from '@/types'
import { isProUser }                from '@/lib/admin'
import { resolveProUntil }          from '@/lib/billing'
import { FREE_LIMITS }              from '@/lib/limits'
import { computeParsedResumeHash }  from '@/lib/resume-hash'
import { locationMatchesCountry, detectLocation } from '@/lib/jobs/location'
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

  // Country code sent by the client — e.g. "in", "us", "gb", or "international_remote".
  // When present, the run lookup is scoped to that country and a safety filter is applied.
  const cc             = new URL(req.url).searchParams.get('cc') ?? ''
  const targetLocation = cc === 'international_remote'
    ? 'international_remote'
    : (CC_TO_LOCATION[cc] ?? null)

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

  // Fetch active resume first so we can compute the resume hash for run lookup
  const resumeResult = await supabase
    .from('resumes')
    .select('id, raw_text, parsed_data')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Compute the parsed resume hash so we can find the matching run
  const parsedData = resumeResult.data?.parsed_data as Record<string, unknown> | null
  const parsedResumeForHash = parsedData as ParsedResume | null
  const resumeHash = parsedResumeForHash
    ? computeParsedResumeHash(parsedResumeForHash as ParsedResume)
    : null

  // Reverse map: "India" → "in", used when client sends no cc (e.g. production with no localStorage)
  const LOCATION_TO_CC: Record<string, string> = Object.fromEntries(
    Object.entries(CC_TO_LOCATION).map(([k, v]) => [v, k])
  )

  // When the client sends no ?cc, derive a country hint from the user's profile location
  // (resume location e.g. "Delhi, India" → "in"). This ensures production users without
  // a localStorage preference still see their country's jobs.
  const profileLocationRaw = (profileRow as Record<string, unknown> | null)?.location as string | null
  const profileCc = (!cc && profileLocationRaw)
    ? detectLocation(profileLocationRaw).countryCode
    : ''

  // Find the latest successful search run for this user+resume combination.
  //  1. Explicit ?cc → find run matching that country
  //  2. No ?cc but profile has a country → find run matching profile country
  //  3. Last resort: latest run of any country (guarded by safety filter below)
  let latestRunId:          string | null = null
  let runDetectedLocation:  string | null = null  // detected_location from the chosen run
  if (resumeHash) {
    // Step 1 / 2: look for a run matching the known or inferred country
    const lookupLocation = targetLocation
      || (profileCc && profileCc !== 'international_remote' ? CC_TO_LOCATION[profileCc] : null)

    if (lookupLocation) {
      const { data: countryRun } = await admin
        .from('job_search_runs')
        .select('id, detected_location')
        .eq('user_id', user.id)
        .eq('resume_hash', resumeHash)
        .eq('status', 'success')
        .eq('detected_location', lookupLocation)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      latestRunId         = countryRun?.id ?? null
      runDetectedLocation = countryRun?.detected_location ?? null
      if (latestRunId) {
        console.log(`[jobs/match] country run found for "${lookupLocation}": ${latestRunId}`)
      }
    }

    // Step 3: most recent run with a specific country (not null, not international_remote).
    // Handles users whose profiles.location is null/unset — skips the mixed/international runs
    // and picks the India (or other country) run directly.
    if (!latestRunId && !cc) {
      const { data: countrySpecificRun } = await admin
        .from('job_search_runs')
        .select('id, detected_location')
        .eq('user_id', user.id)
        .eq('resume_hash', resumeHash)
        .eq('status', 'success')
        .not('detected_location', 'is', null)
        .neq('detected_location', 'international_remote')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (countrySpecificRun?.id) {
        latestRunId         = countrySpecificRun.id
        runDetectedLocation = countrySpecificRun.detected_location
        console.log(`[jobs/match] using most recent country-specific run: ${latestRunId} (detected_location="${runDetectedLocation}")`)
      }
    }

    // Step 4: fallback to latest run of any country
    if (!latestRunId) {
      const { data: anyRun } = await admin
        .from('job_search_runs')
        .select('id, detected_location')
        .eq('user_id', user.id)
        .eq('resume_hash', resumeHash)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      latestRunId         = anyRun?.id ?? null
      runDetectedLocation = anyRun?.detected_location ?? null
      console.log(`[jobs/match] fallback to latest run: ${latestRunId} (detected_location="${runDetectedLocation}")`)
    }
  }

  // Effective country: explicit ?cc > profile-derived > run-derived
  const effectiveCc: string = cc
    || profileCc
    || (runDetectedLocation === 'international_remote'
        ? 'international_remote'
        : (LOCATION_TO_CC[runDetectedLocation ?? ''] ?? ''))

  // What the frontend should display as active country (code + name)
  const runCountryCode = effectiveCc || null
  const runCountryName = runCountryCode === 'international_remote'
    ? 'International / Remote'
    : (CC_TO_LOCATION[runCountryCode ?? ''] ?? null)

  // Build the matches query — scoped to the latest run when available,
  // otherwise fall back to all matches for this user (safe for pre-migration data).
  let matchesQuery = supabase
    .from('job_matches')
    .select(`
      id, similarity_score, ai_score, ai_reasoning, created_at,
      job:jobs (
        id, title, company, location, description,
        url, apply_url, apply_status, last_verified_at,
        salary, source, created_at
      )
    `)
    .eq('user_id', user.id)
    .order('ai_score', { ascending: false })
    .limit(20)

  if (latestRunId) {
    matchesQuery = matchesQuery.eq('search_run_id', latestRunId)
  }

  const matchesResult = await matchesQuery

  // hasResume = true whenever an active resume row exists in the DB.
  // raw_text may be empty if Inngest is still parsing, or if text extraction
  // failed silently — but the resume file IS uploaded. The analyze endpoint
  // handles missing text on its own; don't block the UI here.
  const hasResume = Boolean(resumeResult.data?.id)
  const cvSuggestions = Array.isArray(parsedData?.cv_suggestions)
    ? (parsedData!.cv_suggestions as string[])
    : []

  // Resolve raw match rows — fall back to base schema if new columns aren't in DB yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawMatches: any[] | null = matchesResult.data
  if (matchesResult.error) {
    if (isColumnError(matchesResult.error.code, matchesResult.error.message)) {
      console.warn('[jobs/match] migration pending — retrying without new columns')
      let fallbackQuery = supabase
        .from('job_matches')
        .select(`
          id, similarity_score, ai_score, ai_reasoning, created_at,
          job:jobs (
            id, title, company, location, description,
            url, salary, source, created_at
          )
        `)
        .eq('user_id', user.id)
        .order('ai_score', { ascending: false })
        .limit(20)
      if (latestRunId) fallbackQuery = fallbackQuery.eq('search_run_id', latestRunId)
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

  // ── Location safety filter ───────────────────────────────────────────────
  // Last-line defence: remove any job whose location clearly doesn't match the
  // requested country, regardless of which run they came from.
  let safeMatches = matches
  if (effectiveCc && effectiveCc !== 'international_remote') {
    const before = matches.length
    safeMatches = matches.filter((m) => {
      const job = m.job as Record<string, unknown> | null
      const loc = (job?.location as string | null) ?? null
      const src = (job?.source as string) ?? ''
      const ok  = locationMatchesCountry(loc, src, effectiveCc)
      if (!ok) {
        console.log(
          `[jobs/match] LOCATION_MISMATCH removed | title="${job?.title ?? '?'}"` +
          ` | jobLocation="${loc}" | selectedCountry="${effectiveCc} (${runCountryName})"` +
          ` | removedReason=country_mismatch`
        )
      }
      return ok
    })
    const removed = before - safeMatches.length
    if (removed > 0) {
      console.log(`[jobs/match] safety filter removed ${removed}/${before} jobs for country=${effectiveCc}`)
    }
  }

  const visibleMatches = isPro ? safeMatches : safeMatches.slice(0, matchLimit)
  return NextResponse.json({
    matches:        visibleMatches,
    cvSuggestions,
    hasResume,
    isPro,
    matchLimit,
    totalMatches:   safeMatches.length,
    runCountryCode,   // lets frontend show the chip even when no localStorage pref exists
    runCountryName,
  })
}
