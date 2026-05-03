import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import type { OptimizedResumeData } from '@/lib/ai/optimizer'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId, optimizedData } = await request.json() as {
    jobId?: string | null
    optimizedData: OptimizedResumeData
  }

  if (!optimizedData) {
    return NextResponse.json({ error: 'optimizedData is required' }, { status: 400 })
  }

  const normalizedJobId = jobId || null

  const [{ data: resume }, { data: existing }] = await Promise.all([
    supabase.from('resumes').select('id').eq('user_id', user.id).eq('is_active', true).single(),
    normalizedJobId
      ? supabase.from('optimized_resumes').select('id').eq('user_id', user.id).eq('job_id', normalizedJobId).maybeSingle()
      : supabase.from('optimized_resumes').select('id').eq('user_id', user.id).is('job_id', null).maybeSingle(),
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
      .insert({ user_id: user.id, job_id: normalizedJobId, ...payload })
      .select('id, created_at')
      .single()

    if (error) {
      console.error('[optimize/save] insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    id = inserted.id; createdAt = inserted.created_at
  }

  // Only write back for general optimization — job-specific tailoring must NOT
  // overwrite the base resume or the next analysis will match the wrong jobs.
  if (resume?.id && !normalizedJobId) {
    const parsedUpdate = {
      name:           optimizedData.name,
      email:          optimizedData.email,
      phone:          optimizedData.phone,
      location:       optimizedData.location,
      summary:        optimizedData.summary,
      skills:         optimizedData.skills ?? [],
      experience:     (optimizedData.experience ?? []).map(e => ({
        title: e.title, company: e.company, location: e.location,
        start_date: e.start_date, end_date: e.end_date, bullets: e.bullets ?? [],
      })),
      education:      optimizedData.education ?? [],
      certifications: optimizedData.certifications ?? [],
    }

    const lines: string[] = [
      optimizedData.name, optimizedData.email, optimizedData.phone, optimizedData.location,
    ].filter(Boolean) as string[]
    if (optimizedData.summary) lines.push('\nSUMMARY\n' + optimizedData.summary)
    if (optimizedData.experience?.length) {
      lines.push('\nEXPERIENCE')
      for (const exp of optimizedData.experience) {
        lines.push(`${exp.title} at ${exp.company} (${exp.start_date} – ${exp.end_date ?? 'Present'})`)
        for (const b of exp.bullets ?? []) lines.push(`• ${b}`)
      }
    }
    if (optimizedData.skills?.length) lines.push('\nSKILLS\n' + optimizedData.skills.join(', '))
    if (optimizedData.education?.length) {
      lines.push('\nEDUCATION')
      for (const edu of optimizedData.education)
        lines.push(`${edu.degree} ${edu.field} – ${edu.school} (${edu.graduation_year})`)
    }
    if (optimizedData.certifications?.length)
      lines.push('\nCERTIFICATIONS\n' + optimizedData.certifications.join('\n'))

    const { error: resumeUpdateError } = await supabase
      .from('resumes')
      .update({ parsed_data: parsedUpdate, raw_text: lines.join('\n') })
      .eq('id', resume.id)
      .eq('user_id', user.id)

    if (resumeUpdateError) console.error('[optimize/save] resume update error:', resumeUpdateError.message)
  }

  await createNotification({
    userId: user.id,
    type: 'resume',
    title: 'Resume optimisation complete',
    body: `Your resume has been tailored and saved. ATS score: ${optimizedData.ats_score ?? '—'}.`,
    ctaLabel: 'View Matched Jobs',
    ctaHref: '/matches',
  })

  return NextResponse.json({ id, createdAt, updatedResume: true })
}
