import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { buildAppliedJobPayload } from '@/lib/applied-jobs'
import { computeVerifiedLabel } from '@/types'
import type { ApplicationStatus, ApplyStatus } from '@/types'
import type { MatchRecord } from '@/components/jobs/JobCard'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

function decodeReasoning(raw: string): {
  reasoning:      string
  bridge_advice:  string
  match_reasons:  string[]
  matched_skills: string[]
  missing_skills: string[]
} {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object') {
      return {
        reasoning:      typeof parsed.r      === 'string' ? parsed.r      : raw,
        bridge_advice:  typeof parsed.bridge === 'string' ? parsed.bridge : '',
        match_reasons:  Array.isArray(parsed.mr)   ? parsed.mr   : [],
        matched_skills: Array.isArray(parsed.ms)   ? parsed.ms   : [],
        missing_skills: Array.isArray(parsed.miss) ? parsed.miss : [],
      }
    }
  } catch { /* plain string */ }
  return { reasoning: raw, bridge_advice: '', match_reasons: [], matched_skills: [], missing_skills: [] }
}

function isColumnMissing(code?: string, msg?: string): boolean {
  if (code === '42703' || code === 'PGRST204') return true
  if (msg?.includes('match_snapshot') || msg?.includes('optimized_snapshot')) return true
  return false
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Attempt 1: full fields + match_snapshot + optimized_snapshot (requires migrations 041 + 042)
  const withSnapshot = await supabase
    .from('applications')
    .select('id, status, applied_at, notes, follow_up_messages, created_at, updated_at, match_snapshot, optimized_snapshot, job_id, job:jobs(id, title, company, location, description, url, apply_url, apply_status, last_verified_at, salary, source, created_at)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  // Attempt 2: match_snapshot only (migration 041, not 042)
  const withMatchOnly = withSnapshot.error ? await supabase
    .from('applications')
    .select('id, status, applied_at, notes, follow_up_messages, created_at, updated_at, match_snapshot, job_id, job:jobs(id, title, company, location, description, url, apply_url, apply_status, last_verified_at, salary, source, created_at)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false }) : null

  // Attempt 3: full job fields WITHOUT any snapshot columns
  const withFullJob = (withSnapshot.error && withMatchOnly?.error) ? await supabase
    .from('applications')
    .select('id, status, applied_at, notes, follow_up_messages, created_at, updated_at, job_id, job:jobs(id, title, company, location, description, url, apply_url, apply_status, last_verified_at, salary, source, created_at)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false }) : null

  // Attempt 4: base-only job fields — always safe on any schema version
  const minimal = (withSnapshot.error && withMatchOnly?.error && withFullJob?.error) ? await supabase
    .from('applications')
    .select('id, status, applied_at, notes, follow_up_messages, created_at, updated_at, job_id, job:jobs(id, title, company, location, description, url, salary, source, created_at)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false }) : null

  const applications = withSnapshot.data ?? withMatchOnly?.data ?? withFullJob?.data ?? minimal?.data
  if (!applications) {
    const err = minimal?.error ?? withFullJob?.error ?? withMatchOnly?.error ?? withSnapshot.error
    return NextResponse.json({ error: err?.message ?? 'Failed to fetch applications' }, { status: 500 })
  }

  // Fetch historical match scores for applied jobs that don't have a snapshot.
  // job_matches stores ai_score + ai_reasoning (encodes match_reasons, matched_skills,
  // missing_skills) per user+job — this recovers full card data for legacy applications.
  type AppRow = { id: string; status: string; job_id?: string; match_snapshot?: unknown; job?: unknown }
  const needsScores = (applications as AppRow[])
    .filter(a => a.status === 'applied' && !a.match_snapshot && a.job_id)
    .map(a => a.job_id as string)

  const matchScoresByJobId: Record<string, {
    ai_score: number; ai_reasoning: string; bridge_advice: string;
    match_reasons: string[]; matched_skills: string[]; missing_skills: string[]
  }> = {}

  if (needsScores.length > 0) {
    // job_matches has one row PER RUN (migration 031 dropped the old UNIQUE(user_id, job_id)).
    // Select only base columns (id, ai_score, ai_reasoning, created_at) to avoid PGRST204
    // errors from schema-cache lag on newer columns like matched_skills/missing_skills.
    // All skill arrays are decoded from the ai_reasoning JSON — same as /api/jobs/match does.
    const { data: scores } = await supabase
      .from('job_matches')
      .select('job_id, ai_score, ai_reasoning, created_at')
      .eq('user_id', user.id)
      .in('job_id', needsScores)
      .order('created_at', { ascending: false })

    for (const s of (scores ?? [])) {
      // First occurrence per job_id is the newest run (ORDER BY created_at DESC)
      if (matchScoresByJobId[s.job_id]) continue
      const decoded = decodeReasoning(s.ai_reasoning ?? '')
      matchScoresByJobId[s.job_id] = {
        ai_score:       s.ai_score ?? 0,
        ai_reasoning:   decoded.reasoning,
        bridge_advice:  decoded.bridge_advice,
        match_reasons:  decoded.match_reasons,
        matched_skills: decoded.matched_skills,
        missing_skills: decoded.missing_skills,
      }
    }

    // Fire-and-forget: persist snapshots for apps that now have match data so they
    // survive future resume deletions. Runs after the response is already built.
    const appsToBackfill = (applications as AppRow[]).filter(
      a => a.status === 'applied' && !a.match_snapshot && a.job_id && matchScoresByJobId[a.job_id]
    )
    if (appsToBackfill.length > 0) {
      Promise.all(appsToBackfill.map(async (app) => {
        const ms      = matchScoresByJobId[app.job_id!]
        const jobData = app.job as Record<string, unknown> | null
        if (!jobData || !app.id) return
        const applyStatus    = jobData.apply_status    as ApplyStatus | undefined
        const lastVerifiedAt = jobData.last_verified_at as string | null | undefined
        const snapshot = {
          id:             app.id,
          ai_score:       ms.ai_score,
          ai_reasoning:   ms.ai_reasoning,
          bridge_advice:  ms.bridge_advice,
          match_reasons:  ms.match_reasons,
          matched_skills: ms.matched_skills,
          missing_skills: ms.missing_skills,
          job: {
            id:             jobData.id           ?? '',
            title:          jobData.title        ?? '',
            company:        jobData.company      ?? '',
            location:       jobData.location     ?? '',
            url:            jobData.url          ?? '',
            apply_url:      jobData.apply_url    ?? null,
            apply_status:   applyStatus          ?? null,
            verified_label: computeVerifiedLabel(applyStatus, lastVerifiedAt),
            salary:         jobData.salary       ?? null,
            source:         jobData.source       ?? null,
            description:    jobData.description  ?? '',
            created_at:     jobData.created_at,
          },
        }
        await supabase.from('applications')
          .update({ match_snapshot: snapshot })
          .eq('id', app.id)
          .eq('user_id', user.id)
      })).catch(() => { /* background — swallow */ })
    }
  }

  return NextResponse.json({ applications, matchScoresByJobId })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId, status = 'saved', matchSnapshot, optimizedSnapshot } = await request.json() as {
    jobId?: string
    status?: ApplicationStatus
    matchSnapshot?: MatchRecord
    optimizedSnapshot?: OptimizedResumeData
  }
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  // Atomic upsert — include snapshot columns directly so there's no two-step window
  // where a crash leaves the row without a snapshot.
  const coreRow: Record<string, unknown> = { user_id: user.id, job_id: jobId, status }
  if (status === 'applied') {
    coreRow.applied_at = new Date().toISOString()
    if (matchSnapshot)     coreRow.match_snapshot     = matchSnapshot
    if (optimizedSnapshot) coreRow.optimized_snapshot = optimizedSnapshot
  }

  let upsertRes = await supabase
    .from('applications')
    .upsert(coreRow, { onConflict: 'user_id,job_id' })
    .select('id, status')
    .single()

  // Fall back without snapshot columns if migrations haven't been applied yet
  if (upsertRes.error && isColumnMissing(upsertRes.error.code, upsertRes.error.message)) {
    console.warn('[applications] snapshot columns not yet migrated — upserting without')
    const baseRow: Record<string, unknown> = { user_id: user.id, job_id: jobId, status }
    if (status === 'applied') baseRow.applied_at = new Date().toISOString()
    upsertRes = await supabase
      .from('applications')
      .upsert(baseRow, { onConflict: 'user_id,job_id' })
      .select('id, status')
      .single()
  }

  const { data, error } = upsertRes
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notification
  let jobRes = await supabase
    .from('jobs')
    .select('id, title, company, location, description, url, apply_url, apply_status, last_verified_at, salary, source, created_at')
    .eq('id', jobId)
    .single()
  if (jobRes.error?.code === '42703' || jobRes.error?.code === 'PGRST204') {
    jobRes = await supabase
      .from('jobs')
      .select('id, title, company, location, description, url, salary, source, created_at')
      .eq('id', jobId)
      .single()
  }
  const job = jobRes.data

  if (status === 'applied') {
    const payload = buildAppliedJobPayload({
      userId: user.id,
      applicationId: data.id,
      jobId,
      matchSnapshot: matchSnapshot ?? null,
      optimizedSnapshot: optimizedSnapshot ?? null,
      fallbackJob: job as Record<string, unknown> | null,
    })
    const { data: existingApplied } = await supabase
      .from('applied_jobs')
      .select('id')
      .eq('user_id', user.id)
      .eq('original_job_id', jobId)
      .is('removed_at', null)
      .maybeSingle()
    const appliedWrite = existingApplied?.id
      ? supabase.from('applied_jobs').update(payload).eq('id', existingApplied.id).eq('user_id', user.id)
      : supabase.from('applied_jobs').insert(payload)
    const { error: appliedError } = await appliedWrite
    if (appliedError) return NextResponse.json({ error: appliedError.message }, { status: 500 })
  }

  if (job) {
    const isApplied = status === 'applied'
    await createNotification({
      userId: user.id,
      type: 'application',
      title: isApplied
        ? `Application submitted — ${job.title} at ${job.company}`
        : `${job.title} at ${job.company} saved to tracker`,
      body: isApplied ? 'Good luck! Track your progress in the Tracker.' : 'You can manage this application from the Tracker.',
      ctaLabel: 'View Application',
      ctaHref: '/tracker',
    })
  }

  return NextResponse.json({ application: data })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, notes, follow_up_messages } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (status) {
    updates.status = status as ApplicationStatus
    if (status === 'applied') updates.applied_at = new Date().toISOString()
  }
  if (notes !== undefined) updates.notes = notes
  if (follow_up_messages !== undefined) updates.follow_up_messages = follow_up_messages

  const { data, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, status, job_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (status && status !== 'applied') {
    await supabase
      .from('applied_jobs')
      .update({ removed_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('original_job_id', data.job_id)
      .is('removed_at', null)
  }
  return NextResponse.json({ application: data })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('applications')
    .select('job_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (existing?.job_id) {
    await supabase
      .from('applied_jobs')
      .update({ removed_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('original_job_id', existing.job_id)
      .is('removed_at', null)
  }
  return NextResponse.json({ success: true })
}
