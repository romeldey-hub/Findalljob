import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { optimizeResume, optimizeResumeGeneral, calculateImprovedScore } from '@/lib/ai/optimizer'
import { isProUser } from '@/lib/admin'
import { resolveProUntil } from '@/lib/billing'
import { parseResumeFromPDF } from '@/lib/ai/parser'
import { checkCredits, deductCredits, insufficientCreditsResponse } from '@/lib/credits'
import { FREE_LIMITS } from '@/lib/limits'
import { getOptimizedResumeCache } from '@/lib/cache'
import type { ParsedResume } from '@/types'

function reconstructResumeText(p: ParsedResume): string {
  // Fast path: if the parser captured the full section map, use it — 100% lossless
  if (p.sections?.length) {
    const header = [p.name, p.email, p.phone, p.location].filter(Boolean).join('\n')
    const body   = p.sections.map(s => `\n${s.title.toUpperCase()}\n${s.content}`).join('\n')
    return (header + body).trim()
  }

  // Fallback: rebuild from structured fields (older records without sections[])
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
  if (p.certifications?.length) lines.push('\nCERTIFICATIONS\n' + p.certifications.join('\n'))
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
      jobs ( title, company, location, description, url, salary, source )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resumes: data ?? [] })
}

export const maxDuration = 300

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
    .select('subscription_status, ai_actions_used, plan_tier')
    .eq('user_id', user.id)
    .single()

  const { data: extProfile } = await adminClient
    .from('profiles')
    .select('role, has_used_free_preview')
    .eq('user_id', user.id)
    .single()

  // Billing lifecycle columns (migration 012) — isolated query for safe optional access
  const { data: billingProfile } = await adminClient
    .from('profiles')
    .select('pro_until')
    .eq('user_id', user.id)
    .single()

  const profile = {
    subscription_status:    baseProfile?.subscription_status,
    ai_actions_used:        baseProfile?.ai_actions_used ?? 0,
    role:                   extProfile?.role,
    has_used_free_preview:  extProfile?.has_used_free_preview ?? false,
  }

  const effectiveProUntil = await resolveProUntil(
    adminClient, user.id, baseProfile?.subscription_status, billingProfile?.pro_until
  )
  const isPro    = isProUser(user.email, profile.role, profile.subscription_status, effectiveProUntil)
  const planTier = (baseProfile?.plan_tier as string | null) ?? (isPro ? 'pro' : 'free')

  const body = await request.json()
  const mode = (body.mode as string | undefined) ?? 'job-specific'
  const bodyCurrentScore = typeof body.currentScore === 'number' ? Math.max(0, Math.min(100, body.currentScore)) : 0

  // ── GENERAL MODE ─────────────────────────────────────────────────────────────
  if (mode === 'general') {
    let generalFreeToday = ''
    let generalUsedToday = 0
    // Free users: 1 general optimization preview per day
    if (!isPro) {
      generalFreeToday = new Date().toISOString().slice(0, 10)
      const { data: freeQuota } = await adminClient
        .from('profiles')
        .select('optimize_free_daily_count, optimize_free_date')
        .eq('user_id', user.id)
        .single()
      const isToday = freeQuota?.optimize_free_date === generalFreeToday
      generalUsedToday = isToday ? (freeQuota?.optimize_free_daily_count ?? 0) : 0
      if (generalUsedToday >= FREE_LIMITS.optimizationsPerDay) {
        return NextResponse.json(
          { requiresUpgrade: true, error: 'You\'ve used your free optimization preview for today. Upgrade to keep tailoring your resume and improve your shortlist chances.' },
          { status: 429 }
        )
      }
    }
    const resumeResult = await supabase
      .from('resumes')
      .select('id, raw_text, parsed_data, file_url')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (resumeResult.error || !resumeResult.data) {
      return NextResponse.json({ error: 'No active resume found' }, { status: 404 })
    }

    const { file_url } = resumeResult.data
    let raw_text: string = resumeResult.data.raw_text ?? ''

    if (!raw_text || raw_text.length < 50) {
      const parsed = resumeResult.data.parsed_data as ParsedResume | null
      if (parsed?.name) {
        raw_text = reconstructResumeText(parsed)
      } else if (file_url) {
        try {
          const fileRes = await fetch(file_url)
          if (!fileRes.ok) throw new Error('Could not download resume file')
          const buffer = Buffer.from(await fileRes.arrayBuffer())
          const reparsed = await parseResumeFromPDF(buffer, user.id, !isPro)
          raw_text = reconstructResumeText(reparsed)
        } catch (err) {
          console.error('[optimize:general] PDF re-parse failed:', err)
          return NextResponse.json({ error: 'Could not read resume content. Please re-upload your resume.' }, { status: 400 })
        }
      } else {
        return NextResponse.json({ error: 'Resume has no readable content. Please re-upload your resume.' }, { status: 400 })
      }
    }

    let optimizedData
    try {
      optimizedData = await optimizeResumeGeneral(raw_text, user.id, !isPro)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[optimize:general] Claude failed:', msg)
      return NextResponse.json({ error: `AI optimization failed: ${msg}` }, { status: 500 })
    }

    // Score floor: optimized score must never be lower than the user's current score.
    // bodyCurrentScore is the heuristic score shown on the Resume page before optimization.
    if (bodyCurrentScore > 0 && optimizedData.ats_score < bodyCurrentScore) {
      console.log(`[optimize:general] score floor applied | user=${user.id} | ai_score=${optimizedData.ats_score} → ${bodyCurrentScore}`)
      optimizedData.ats_score = bodyCurrentScore
    }

    if (!isPro) {
      void adminClient.from('profiles').update({ optimize_free_daily_count: generalUsedToday + 1, optimize_free_date: generalFreeToday }).eq('user_id', user.id)
    }

    return NextResponse.json({ optimizedData, mode: 'general', isFreePreview: false })
  }

  // ── JOB-SPECIFIC MODE ────────────────────────────────────────────────────────

  // Hoisted so the finalize block can reference them without re-fetching
  const JOB_OPTIMIZE_MONTHLY_LIMIT = 3
  const thisMonth = new Date().toISOString().slice(0, 7) // "YYYY-MM"
  let proCurrentCount = 0
  let proCreditCost   = 0
  let freeUsedToday   = 0
  let freeToday       = ''

  if (!isPro) {
    // Free users get 1 preview per day (shared quota with general optimization)
    freeToday = new Date().toISOString().slice(0, 10)
    const { data: freeQuota } = await adminClient
      .from('profiles')
      .select('optimize_free_daily_count, optimize_free_date')
      .eq('user_id', user.id)
      .single()
    const isToday = freeQuota?.optimize_free_date === freeToday
    freeUsedToday = isToday ? (freeQuota?.optimize_free_daily_count ?? 0) : 0
    if (freeUsedToday >= FREE_LIMITS.optimizationsPerDay) {
      return NextResponse.json(
        { requiresUpgrade: true, error: "You've used your free optimization preview for today. Upgrade to keep tailoring your resume for every job." },
        { status: 402 }
      )
    }
  } else {
    // Pro users: monthly quota + credit check before the expensive Claude call
    const { data: quotaRow } = await adminClient
      .from('profiles')
      .select('job_optimize_month_count, job_optimize_month')
      .eq('user_id', user.id)
      .single()
    const currentMonth = quotaRow?.job_optimize_month ?? ''
    proCurrentCount = currentMonth === thisMonth ? (quotaRow?.job_optimize_month_count ?? 0) : 0
    if (proCurrentCount >= JOB_OPTIMIZE_MONTHLY_LIMIT) {
      return NextResponse.json(
        { error: `Monthly limit reached: you can optimize your resume for ${JOB_OPTIMIZE_MONTHLY_LIMIT} specific jobs per month. Resets on the 1st.` },
        { status: 429 }
      )
    }
    const { allowed: creditAllowed, balance: creditBalance, cost: creditCost } =
      await checkCredits(user.id, 'jobOptimize', isPro, adminClient, planTier)
    if (!creditAllowed) {
      return NextResponse.json(
        insufficientCreditsResponse('jobOptimize', creditBalance.remainingCredits),
        { status: 402 }
      )
    }
    proCreditCost = creditCost
  }

  const { jobId } = body
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

  if (!raw_text || raw_text.length < 50) {
    const parsed = resumeResult.data.parsed_data as ParsedResume | null
    if (parsed?.name) {
      raw_text = reconstructResumeText(parsed)
    } else if (file_url) {
      try {
        const fileRes = await fetch(file_url)
        if (!fileRes.ok) throw new Error('Could not download resume file')
        const buffer = Buffer.from(await fileRes.arrayBuffer())
        const reparsed = await parseResumeFromPDF(buffer, user.id, !isPro)
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

  // Cache check for Pro users: return a saved optimization for the same resume+job
  if (isPro) {
    const cached = await getOptimizedResumeCache(adminClient, user.id, jobId, resumeResult.data.id)
    if (cached) {
      console.log('[optimize] cache hit job_id=%s resume_id=%s', jobId, resumeResult.data.id)
      return NextResponse.json({
        optimizedData: cached,
        jobTitle:      title,
        company,
        location:      location ?? '',
        description:   description ?? '',
        salary:        salary ?? null,
        applyUrl:      url,
        isFreePreview: false,
        fromCache:     true,
      })
    }
  }

  let optimizedData
  try {
    optimizedData = await optimizeResume(raw_text, title, description, company, originalScore, user.id, !isPro)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[optimize] Claude failed:', msg)
    return NextResponse.json({ error: `AI optimization failed: ${msg}` }, { status: 500 })
  }

  if (originalScore > 0 && optimizedData.score_improvements) {
    optimizedData.ats_score = calculateImprovedScore(originalScore, optimizedData.score_improvements)
    optimizedData.original_score = originalScore
  } else if (originalScore > 0 && optimizedData.ats_score < originalScore) {
    optimizedData.ats_score = originalScore
    optimizedData.original_score = originalScore
  }

  // ── Finalize: free preview vs Pro save ──────────────────────────────────────
  if (!isPro) {
    // Consume the free preview slot (quota was verified above)
    void adminClient
      .from('profiles')
      .update({ optimize_free_daily_count: freeUsedToday + 1, optimize_free_date: freeToday })
      .eq('user_id', user.id)

    return NextResponse.json({
      optimizedData,
      jobTitle: title,
      company,
      location:      location ?? '',
      description:   description ?? '',
      salary:        salary ?? null,
      applyUrl:      url,
      isFreePreview: true,
    })
  }

  // Pro: deduct credits and increment monthly counter
  const afterCredits = await deductCredits(user.id, 'jobOptimize', adminClient)
  void adminClient
    .from('profiles')
    .update({
      job_optimize_month_count: proCurrentCount + 1,
      job_optimize_month: thisMonth,
    })
    .eq('user_id', user.id)

  return NextResponse.json({
    optimizedData,
    jobTitle: title,
    company,
    location:         location ?? '',
    description:      description ?? '',
    salary:           salary ?? null,
    applyUrl:         url,
    isFreePreview:    false,
    creditCost:       proCreditCost,
    creditsUsed:      proCreditCost,
    creditsRemaining: afterCredits?.remainingCredits ?? 0,
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
