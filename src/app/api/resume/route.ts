import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { computeVerifiedLabel } from '@/types'
import type { ParsedResume, ApplyStatus } from '@/types'

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed_data = body.parsed_data as ParsedResume | undefined
  if (!parsed_data) return NextResponse.json({ error: 'parsed_data required' }, { status: 400 })

  const { error } = await supabase
    .from('resumes')
    .update({ parsed_data })
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (error) {
    console.error('[resume/patch] update error:', error.message)
    return NextResponse.json({ error: 'Failed to save changes' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE() {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 1. Fetch active resume ─────────────────────────────────────────────────
  const { data: resume, error: fetchErr } = await supabase
    .from('resumes')
    .select('id, file_url')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchErr) {
    console.error('[resume/delete] fetch error:', fetchErr.message)
    return NextResponse.json({ error: 'Failed to fetch resume' }, { status: 500 })
  }
  if (!resume) {
    return NextResponse.json({ error: 'No active resume found' }, { status: 404 })
  }

  console.log(`[resume/delete] user=${user.id} resume_id=${resume.id}`)

  // ── 2. Delete file from storage (best-effort) ─────────────────────────────
  if (resume.file_url) {
    try {
      // Public URL format: .../storage/v1/object/public/resumes/{path}
      const storagePath = resume.file_url.split('/storage/v1/object/public/resumes/')[1]?.split('?')[0]
      if (storagePath) {
        const { error: storageErr } = await admin.storage.from('resumes').remove([storagePath])
        if (storageErr) console.warn('[resume/delete] storage remove warning:', storageErr.message)
        else console.log('[resume/delete] storage file removed:', storagePath)
      }
    } catch (err) {
      console.warn('[resume/delete] storage delete failed (non-fatal):', err)
    }
  }

  // ── 3. Pre-deletion: backfill match_snapshot for applied jobs that don't have one ──
  // Must run BEFORE deleting job_matches so score/skills data is still available.
  try {
    const { data: unapplied } = await admin
      .from('applications')
      .select('id, job_id')
      .eq('user_id', user.id)
      .eq('status', 'applied')
      .is('match_snapshot', null)

    if (unapplied && unapplied.length > 0) {
      const jobIds = (unapplied as { id: string; job_id: string }[]).map(a => a.job_id)

      const [{ data: matchRows }, { data: jobRows }] = await Promise.all([
        admin.from('job_matches')
          .select('job_id, id, ai_score, ai_reasoning')
          .eq('user_id', user.id)
          .in('job_id', jobIds)
          .order('ai_score', { ascending: false }),
        admin.from('jobs')
          .select('id, title, company, location, url, apply_url, apply_status, last_verified_at, salary, source, description, created_at')
          .in('id', jobIds),
      ])

      const bestByJobId = new Map<string, { id: string; ai_score: number; ai_reasoning: string }>()
      for (const m of (matchRows ?? []) as { job_id: string; id: string; ai_score: number; ai_reasoning: string }[]) {
        if (!bestByJobId.has(m.job_id)) bestByJobId.set(m.job_id, m)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobById = new Map<string, Record<string, unknown>>((jobRows ?? []).map((j: any) => [j.id as string, j as Record<string, unknown>]))

      for (const app of unapplied as { id: string; job_id: string }[]) {
        const job   = jobById.get(app.job_id)
        if (!job) continue
        const match = bestByJobId.get(app.job_id)

        let reasoning = '', bridgeAdvice = ''
        let matchReasons: string[] = [], matchedSkills: string[] = [], missingSkills: string[] = []
        if (match?.ai_reasoning) {
          try {
            const p = JSON.parse(match.ai_reasoning)
            if (typeof p === 'object') {
              reasoning    = typeof p.r      === 'string' ? p.r      : ''
              bridgeAdvice = typeof p.bridge === 'string' ? p.bridge : ''
              matchReasons  = Array.isArray(p.mr)   ? p.mr   : []
              matchedSkills = Array.isArray(p.ms)   ? p.ms   : []
              missingSkills = Array.isArray(p.miss) ? p.miss : []
            }
          } catch { reasoning = match.ai_reasoning }
        }

        const applyStatus    = job.apply_status    as ApplyStatus | undefined
        const lastVerifiedAt = job.last_verified_at as string | null | undefined
        const snapshot = {
          id:             match?.id ?? app.id,
          ai_score:       match?.ai_score ?? 0,
          ai_reasoning:   reasoning,
          bridge_advice:  bridgeAdvice,
          match_reasons:  matchReasons,
          matched_skills: matchedSkills,
          missing_skills: missingSkills,
          job: {
            id:             job.id           ?? '',
            title:          job.title        ?? '',
            company:        job.company      ?? '',
            location:       job.location     ?? '',
            url:            job.url          ?? '',
            apply_url:      job.apply_url    ?? null,
            apply_status:   applyStatus      ?? null,
            verified_label: computeVerifiedLabel(applyStatus, lastVerifiedAt),
            salary:         job.salary       ?? null,
            source:         job.source       ?? null,
            description:    job.description  ?? '',
            created_at:     job.created_at,
          },
        }
        await admin.from('applications').update({ match_snapshot: snapshot }).eq('id', app.id)
      }
      console.log(`[resume/delete] pre-deletion backfill: ${unapplied.length} applied job snapshots saved`)
    }
  } catch (err) {
    console.warn('[resume/delete] pre-deletion backfill failed (non-fatal):', err)
  }

  // ── 4. Preserve scoped search runs ─────────────────────────────────────────
  // job_matches now contain immutable display snapshots for completed
  // job_search_runs.  Do not delete them when the source resume is removed;
  // otherwise refresh would break previously saved/displayed match cards.
  console.log('[resume/delete] preserved job_search_runs/job_matches snapshots for user', user.id)

  // ── 5. Delete the resume row ───────────────────────────────────────────────
  const { error: dbErr } = await admin
    .from('resumes')
    .delete()
    .eq('id', resume.id)

  if (dbErr) {
    console.error('[resume/delete] resumes row delete error:', dbErr.message)
    return NextResponse.json({ error: 'Failed to delete resume record' }, { status: 500 })
  }

  console.log('[resume/delete] done — resume_id:', resume.id)

  // ── 6. Auto-disable public profile if active (non-fatal) ──────────────────
  // Only disable when the profile is currently public. If the user already had
  // it off manually, leave it unchanged (flag stays false).
  try {
    const { data: profileRow } = await admin
      .from('profiles')
      .select('profile_public')
      .eq('user_id', user.id)
      .single()

    if (profileRow?.profile_public) {
      await admin
        .from('profiles')
        .update({ profile_public: false, profile_auto_disabled_no_resume: true })
        .eq('user_id', user.id)
      console.log('[resume/delete] auto-disabled public profile for user', user.id)
    }
  } catch (err) {
    console.warn('[resume/delete] auto-disable profile visibility failed (non-fatal):', err)
  }

  return NextResponse.json({ success: true })
}
