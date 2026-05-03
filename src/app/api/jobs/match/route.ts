import { NextResponse }       from 'next/server'
import { createClient }       from '@/lib/supabase/server'
import { computeVerifiedLabel } from '@/types'
import type { ApplyStatus }   from '@/types'

function decodeReasoning(raw: string): {
  reasoning:      string
  bridge_advice:  string
  matched_skills: string[]
  missing_skills: string[]
} {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && typeof parsed.r === 'string') {
      return {
        reasoning:      parsed.r,
        bridge_advice:  typeof parsed.bridge === 'string' ? parsed.bridge : '',
        matched_skills: Array.isArray(parsed.ms)   ? parsed.ms   : [],
        missing_skills: Array.isArray(parsed.miss) ? parsed.miss : [],
      }
    }
  } catch { /* plain string fallback */ }
  return { reasoning: raw, bridge_advice: '', matched_skills: [], missing_skills: [] }
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

  const [matchesResult, resumeResult] = await Promise.all([
    supabase
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
      .limit(50),
    supabase
      .from('resumes')
      .select('id, raw_text, parsed_data')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // hasResume = true whenever an active resume row exists in the DB.
  // raw_text may be empty if Inngest is still parsing, or if text extraction
  // failed silently — but the resume file IS uploaded. The analyze endpoint
  // handles missing text on its own; don't block the UI here.
  const hasResume = Boolean(resumeResult.data?.id)
  const parsedData    = resumeResult.data?.parsed_data as Record<string, unknown> | null
  const cvSuggestions = Array.isArray(parsedData?.cv_suggestions)
    ? (parsedData!.cv_suggestions as string[])
    : []

  // Resolve raw match rows — fall back to base schema if new columns aren't in DB yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawMatches: any[] | null = matchesResult.data
  if (matchesResult.error) {
    if (isColumnError(matchesResult.error.code, matchesResult.error.message)) {
      console.warn('[jobs/match] migration pending — retrying without new columns')
      const fallback = await supabase
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
        .limit(50)

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
      matched_skills: decoded.matched_skills,
      missing_skills: decoded.missing_skills,
      job: {
        ...job,
        verified_label,
      },
    }
  })

  return NextResponse.json({ matches, cvSuggestions, hasResume })
}
