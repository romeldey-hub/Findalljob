import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { computeParsedResumeHash } from '@/lib/resume-hash'
import type { ParsedResume } from '@/types'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Resolve the active resume's content hash so we only return runs for the
  // current resume — not stale runs from a previously uploaded different resume.
  const { data: resumeRow } = await supabase
    .from('resumes')
    .select('id, parsed_data')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const parsedData     = resumeRow?.parsed_data as ParsedResume | null
  const activeResumeId = resumeRow?.id ?? null
  const activeResumeHash = parsedData?.name ? computeParsedResumeHash(parsedData) : null

  console.log(
    `[openai-search/results] identity | user=${user.id}` +
    ` | resume_id=${activeResumeId ?? 'none'}` +
    ` | resume_hash=${activeResumeHash ?? 'none'}`
  )

  let runQuery = admin
    .from('openai_search_runs')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)

  if (activeResumeHash) {
    runQuery = runQuery.eq('resume_hash', activeResumeHash)
  }

  const { data: run, error: runError } = await runQuery.maybeSingle()

  if (runError) {
    console.error('[api/openai-search/results] run lookup failed:', runError.message)
    return NextResponse.json({ error: runError.message }, { status: 500 })
  }

  if (!run) {
    console.log(
      `[openai-search/results] no run for resume_hash=${activeResumeHash ?? 'none'} — returning empty`
    )
    return NextResponse.json({ run: null, results: [], count: 0 })
  }

  const { data: results, error: resultsError } = await admin
    .from('openai_search_results')
    .select('*')
    .eq('user_id', user.id)
    .eq('search_run_id', run.id)
    .order('final_score', { ascending: false })
    .order('rank_position', { ascending: true })

  if (resultsError) {
    console.error('[api/openai-search/results] results lookup failed:', resultsError.message)
    return NextResponse.json({ error: resultsError.message }, { status: 500 })
  }

  const mappedResults = (results ?? []).map((result, index) => ({
    ...result,
    rank_position: index + 1,
  }))

  console.log(
    `[openai-search/results] loaded | count=${mappedResults.length}` +
    ` | run=${run.id}` +
    ` | resume_hash=${activeResumeHash ?? 'none'}` +
    ` | source=db_cache`
  )

  return NextResponse.json({
    run,
    results: mappedResults,
    count: mappedResults.length,
  })
}
