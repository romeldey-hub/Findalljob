import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { optimizeResume, calculateImprovedScore } from '@/lib/ai/optimizer'
import { isProUser } from '@/lib/admin'
import { parseResumeFromPDF } from '@/lib/ai/parser'
import type { ParsedResume } from '@/types'

function reconstructResumeText(p: ParsedResume): string {
  const lines: string[] = []
  if (p.name)     lines.push(p.name)
  if (p.email)    lines.push(p.email)
  if (p.phone)    lines.push(p.phone)
  if (p.location) lines.push(p.location)
  if (p.summary)  lines.push('\nSUMMARY\n' + p.summary)
  if (p.experience?.length) {
    lines.push('\nEXPERIENCE')
    for (const exp of p.experience) {
      lines.push(`${exp.title} at ${exp.company} (${exp.start_date} – ${exp.end_date ?? 'Present'})`)
      for (const b of exp.bullets ?? []) lines.push(`• ${b}`)
    }
  }
  if (p.skills?.length) lines.push('\nSKILLS\n' + p.skills.join(', '))
  if (p.education?.length) {
    lines.push('\nEDUCATION')
    for (const edu of p.education) {
      lines.push(`${edu.degree} ${edu.field} – ${edu.school} (${edu.graduation_year})`)
    }
  }
  return lines.join('\n')
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('optimized_resumes')
    .select(`
      id, job_id, optimized_text, created_at,
      jobs ( title, company, location, description, url, salary )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resumes: data ?? [] })
}

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use admin client for reads — bypasses RLS and isolates optional columns
  // (role, has_used_free_preview) so a missing migration can't null-out the
  // whole profile and misidentify the user as free.
  const adminClient = createAdminClient()

  const { data: baseProfile } = await adminClient
    .from('profiles')
    .select('subscription_status, ai_actions_used')
    .eq('user_id', user.id)
    .single()

  const { data: extProfile } = await adminClient
    .from('profiles')
    .select('role, has_used_free_preview')
    .eq('user_id', user.id)
    .single()

  const profile = {
    subscription_status:    baseProfile?.subscription_status,
    ai_actions_used:        baseProfile?.ai_actions_used ?? 0,
    role:                   extProfile?.role,
    has_used_free_preview:  extProfile?.has_used_free_preview ?? false,
  }

  const isPro = isProUser(user.email, profile.role, profile.subscription_status)

  if (!isPro) {
    // Check anti-abuse hash first (catches delete-and-re-signup)
    const emailHash = createHash('sha256').update(user.email ?? '').digest('hex')
    const admin = createAdminClient()
    const { data: hashRow } = await admin
      .from('preview_email_hashes')
      .select('email_hash')
      .eq('email_hash', emailHash)
      .maybeSingle()

    if (hashRow || profile?.has_used_free_preview) {
      return NextResponse.json(
        { requiresUpgrade: true, error: 'Upgrade to Pro for unlimited AI resume optimizations.' },
        { status: 402 }
      )
    }
  }

  const { jobId } = await request.json()
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  const [resumeResult, jobResult, matchResult] = await Promise.all([
    supabase
      .from('resumes')
      .select('id, raw_text, parsed_data, file_url')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single(),
    supabase
      .from('jobs')
      .select('title, company, location, description, url, salary')
      .eq('id', jobId)
      .single(),
    supabase
      .from('job_matches')
      .select('ai_score')
      .eq('user_id', user.id)
      .eq('job_id', jobId)
      .maybeSingle(),
  ])

  if (resumeResult.error || !resumeResult.data) {
    return NextResponse.json({ error: 'No active resume found' }, { status: 404 })
  }
  if (jobResult.error || !jobResult.data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { file_url } = resumeResult.data
  let raw_text: string = resumeResult.data.raw_text ?? ''

  // If raw_text is missing, fall back to reconstructing from parsed_data or re-parsing the PDF
  if (!raw_text || raw_text.length < 50) {
    const parsed = resumeResult.data.parsed_data as ParsedResume | null
    if (parsed?.name) {
      raw_text = reconstructResumeText(parsed)
    } else if (file_url) {
      try {
        const fileRes = await fetch(file_url)
        if (!fileRes.ok) throw new Error('Could not download resume file')
        const buffer = Buffer.from(await fileRes.arrayBuffer())
        const reparsed = await parseResumeFromPDF(buffer)
        raw_text = reconstructResumeText(reparsed)
      } catch (err) {
        console.error('[optimize] PDF re-parse failed:', err)
        return NextResponse.json({ error: 'Could not read resume content. Please re-upload your resume.' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: 'Resume has no readable content. Please re-upload your resume.' }, { status: 400 })
    }
  }
  const { title, company, location, description, url, salary } = jobResult.data

  const originalScore = matchResult.data?.ai_score ?? 0

  let optimizedData
  try {
    optimizedData = await optimizeResume(raw_text, title, description, company, originalScore)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[optimize] Claude failed:', msg)
    return NextResponse.json({ error: `AI optimization failed: ${msg}` }, { status: 500 })
  }

  // Replace Claude's ats_score with the formula-derived score so it reflects
  // real per-dimension improvements and never drops below the original match score.
  if (originalScore > 0 && optimizedData.score_improvements) {
    optimizedData.ats_score = calculateImprovedScore(originalScore, optimizedData.score_improvements)
    optimizedData.original_score = originalScore
  } else if (originalScore > 0 && optimizedData.ats_score < originalScore) {
    // Fallback: score_improvements missing — keep original as floor
    optimizedData.ats_score = originalScore
    optimizedData.original_score = originalScore
  }

  let isFreePreview = false
  if (!isPro) {
    // Mark free preview as used — both on profile and in the global hash table
    const emailHash = createHash('sha256').update(user.email ?? '').digest('hex')
    await Promise.all([
      adminClient
        .from('profiles')
        .update({ has_used_free_preview: true, ai_actions_used: (profile.ai_actions_used ?? 0) + 1 })
        .eq('user_id', user.id),
      adminClient
        .from('preview_email_hashes')
        .upsert({ email_hash: emailHash }, { onConflict: 'email_hash', ignoreDuplicates: true }),
    ])
    isFreePreview = true
  }

  return NextResponse.json({
    optimizedData,
    jobTitle: title,
    company,
    location: location ?? '',
    description: description ?? '',
    salary: salary ?? null,
    applyUrl: url,
    isFreePreview,
  })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('optimized_resumes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
