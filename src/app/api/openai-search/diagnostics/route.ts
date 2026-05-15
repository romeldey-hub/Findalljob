import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const runId = req.nextUrl.searchParams.get('runId')
  const admin = createAdminClient()

  let query = admin
    .from('openai_search_diagnostics')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (runId) {
    query = query.eq('search_run_id', runId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[api/openai-search/diagnostics] lookup failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ diagnostics: data ?? [] })
}
