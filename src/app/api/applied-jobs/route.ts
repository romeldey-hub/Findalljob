import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAppliedJobPayload } from '@/lib/applied-jobs'
import type { MatchRecord } from '@/components/jobs/JobCard'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('applied_jobs')
    .select('*')
    .eq('user_id', user.id)
    .is('removed_at', null)
    .order('applied_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appliedJobs: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as {
    jobId?: string
    applicationId?: string | null
    matchSnapshot?: MatchRecord | null
    optimizedSnapshot?: OptimizedResumeData | null
  }
  if (!body.jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  let fallbackJobRes = await supabase
    .from('jobs')
    .select('id, title, company, location, description, url, apply_url, apply_status, last_verified_at, salary, source, created_at')
    .eq('id', body.jobId)
    .maybeSingle()
  if (fallbackJobRes.error?.code === '42703' || fallbackJobRes.error?.code === 'PGRST204') {
    fallbackJobRes = await supabase
      .from('jobs')
      .select('id, title, company, location, description, url, salary, source, created_at')
      .eq('id', body.jobId)
      .maybeSingle()
  }

  const payload = buildAppliedJobPayload({
    userId: user.id,
    applicationId: body.applicationId ?? null,
    jobId: body.jobId,
    matchSnapshot: body.matchSnapshot ?? null,
    optimizedSnapshot: body.optimizedSnapshot ?? null,
    fallbackJob: fallbackJobRes.data as Record<string, unknown> | null,
  })

  const { data: existing } = await supabase
    .from('applied_jobs')
    .select('id')
    .eq('user_id', user.id)
    .eq('original_job_id', body.jobId)
    .is('removed_at', null)
    .maybeSingle()

  const write = existing?.id
    ? supabase.from('applied_jobs').update(payload).eq('id', existing.id).eq('user_id', user.id)
    : supabase.from('applied_jobs').insert(payload)

  const { data, error } = await write.select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appliedJob: data })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as {
    id?: string
    jobId?: string
    applicationId?: string | null
    optimizedSnapshot?: OptimizedResumeData | null
    removeOptimizedSnapshot?: boolean
  }

  const updates: Record<string, unknown> = {}
  if (body.optimizedSnapshot) {
    updates.optimized_resume_snapshot = body.optimizedSnapshot
    updates.optimized_resume_score = typeof body.optimizedSnapshot.ats_score === 'number'
      ? body.optimizedSnapshot.ats_score
      : null
    updates.optimized_resume_view_data = body.optimizedSnapshot
    updates.optimized_resume_download_data = body.optimizedSnapshot
  }
  if (body.removeOptimizedSnapshot) {
    updates.optimized_resume_snapshot = null
    updates.optimized_resume_score = null
    updates.optimized_resume_view_data = null
    updates.optimized_resume_download_data = null
  }
  if (body.applicationId !== undefined) updates.application_id = body.applicationId

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  let query = supabase.from('applied_jobs').update(updates).eq('user_id', user.id).is('removed_at', null)
  query = body.id ? query.eq('id', body.id) : query.eq('original_job_id', body.jobId ?? '')
  const { data, error } = await query.select('*').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appliedJob: data })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const jobId = searchParams.get('jobId')
  if (!id && !jobId) return NextResponse.json({ error: 'id or jobId required' }, { status: 400 })

  let query = supabase
    .from('applied_jobs')
    .update({ removed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('removed_at', null)

  query = id ? query.eq('id', id) : query.eq('original_job_id', jobId!)
  const { error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
