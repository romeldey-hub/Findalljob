import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function decodeReasoning(raw: string): {
  reasoning: string
  matched_skills: string[]
  missing_skills: string[]
} {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && typeof parsed.r === 'string') {
      return {
        reasoning: parsed.r,
        matched_skills: Array.isArray(parsed.ms) ? parsed.ms : [],
        missing_skills: Array.isArray(parsed.miss) ? parsed.miss : [],
      }
    }
  } catch { /* plain string */ }
  return { reasoning: raw, matched_skills: [], missing_skills: [] }
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
          id, title, company, location, description, url, salary, source, created_at
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

  if (matchesResult.error) {
    console.error('[jobs/match] select error:', matchesResult.error.message)
    return NextResponse.json({ error: matchesResult.error.message }, { status: 500 })
  }

  const matches = (matchesResult.data ?? []).map((m) => {
    const decoded = decodeReasoning(m.ai_reasoning ?? '')
    return {
      ...m,
      ai_reasoning: decoded.reasoning,
      matched_skills: decoded.matched_skills,
      missing_skills: decoded.missing_skills,
    }
  })

  const parsedData = resumeResult.data?.parsed_data as Record<string, unknown> | null
  const cvSuggestions = Array.isArray(parsedData?.cv_suggestions)
    ? (parsedData!.cv_suggestions as string[])
    : []

  // Tell the frontend whether the user has a resume so it can auto-trigger analysis
  const hasResume = Boolean(
    resumeResult.data?.raw_text && resumeResult.data.raw_text.length > 50
  )

  return NextResponse.json({ matches, cvSuggestions, hasResume })
}
