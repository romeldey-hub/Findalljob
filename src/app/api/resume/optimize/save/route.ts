import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId, optimizedData } = await request.json() as {
    jobId: string
    optimizedData: OptimizedResumeData
  }

  if (!jobId || !optimizedData) {
    return NextResponse.json({ error: 'jobId and optimizedData are required' }, { status: 400 })
  }

  const [{ data: resume }, { data: existing }] = await Promise.all([
    supabase.from('resumes').select('id').eq('user_id', user.id).eq('is_active', true).single(),
    supabase.from('optimized_resumes').select('id').eq('user_id', user.id).eq('job_id', jobId).maybeSingle(),
  ])

  const payload = {
    base_resume_id: resume?.id ?? null,
    optimized_text: JSON.stringify(optimizedData),
    // Also write ats_score as a native column for direct querying/filtering
    ats_score: typeof optimizedData.ats_score === 'number' ? optimizedData.ats_score : null,
  }

  let id: string, createdAt: string

  if (existing?.id) {
    // UPDATE — one job, one resume (Rule 5)
    const { data: updated, error } = await supabase
      .from('optimized_resumes')
      .update(payload)
      .eq('id', existing.id)
      .eq('user_id', user.id)
      .select('id, created_at')
      .single()

    if (error) {
      console.error('[optimize/save] update error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    id = updated.id; createdAt = updated.created_at
  } else {
    // INSERT
    const { data: inserted, error } = await supabase
      .from('optimized_resumes')
      .insert({ user_id: user.id, job_id: jobId, ...payload })
      .select('id, created_at')
      .single()

    if (error) {
      console.error('[optimize/save] insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    id = inserted.id; createdAt = inserted.created_at
  }

  await createNotification({
    userId: user.id,
    type: 'resume',
    title: 'Resume optimisation complete',
    body: `Your resume has been tailored and saved. ATS score: ${optimizedData.ats_score ?? '—'}.`,
    ctaLabel: 'View Resume',
    ctaHref: '/optimizer',
  })

  return NextResponse.json({ id, createdAt })
}
