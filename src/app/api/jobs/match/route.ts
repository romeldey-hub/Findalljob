import { NextResponse }          from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { computeVerifiedLabel }  from '@/types'
import { isProUser }             from '@/lib/admin'
import { resolveProUntil }       from '@/lib/billing'
import { FREE_LIMITS }           from '@/lib/limits'
import { computeParsedResumeHash } from '@/lib/resume-hash'
import type { ApplyStatus, ParsedResume } from '@/types'

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

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve Pro status — used to determine match cap
  const admin = createAdminClient()
  const { data: profileRow } = await admin
    .from('profiles')
    .select('role, subscription_status, pro_until')
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
  const resumeHash = parsedResumeForHash?.name
    ? computeParsedResumeHash(parsedResumeForHash as ParsedResume)
    : null

  // Find the latest successful search run for this user+resume combination.
  // Falls back to null (no run filter) so existing users without runs still see matches.
  let latestRunId: string | null = null
  if (resumeHash) {
    const { data: runRow } = await admin
      .from('job_search_runs')
      .select('id')
      .eq('user_id', user.id)
      .eq('resume_hash', resumeHash)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    latestRunId = runRow?.id ?? null
  }

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

  const visibleMatches = isPro ? matches : matches.slice(0, matchLimit)
  return NextResponse.json({ matches: visibleMatches, cvSuggestions, hasResume, isPro, matchLimit, totalMatches: matches.length })
}
