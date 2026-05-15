import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: run, error: runError } = await admin
    .from('openai_search_runs')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runError) {
    console.error('[api/openai-search/results] run lookup failed:', runError.message)
    return NextResponse.json({ error: runError.message }, { status: 500 })
  }

  if (!run) {
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

  return NextResponse.json({
    run,
    results: (results ?? []).map((result, index) => ({
      ...result,
      rank_position: index + 1,
    })),
    count: results?.length ?? 0,
  })
}
