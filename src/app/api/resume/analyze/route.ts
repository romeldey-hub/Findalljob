import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { parseResume, parseResumeFromPDF, generateHeadline } from '@/lib/ai/parser'
import { rerankJobs } from '@/lib/ai/reranker'
import { generateCvSuggestions } from '@/lib/ai/suggestions'
import { AdzunaAdapter } from '@/lib/jobs/sources/adzuna'
import { createNotification } from '@/lib/notifications'
import type { ParsedResume } from '@/types'

export const maxDuration = 60

function apiErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export async function POST() {
  // ── 0. Environment sanity check ────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set in .env.local' },
      { status: 500 }
    )
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 1. Fetch active resume ──────────────────────────────────────────────────
  const { data: resume, error: resumeError } = await supabase
    .from('resumes')
    .select('id, raw_text, parsed_data, file_url')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (resumeError || !resume) {
    return NextResponse.json(
      { error: 'No active resume found. Please upload one first.' },
      { status: 404 }
    )
  }

  // ── 2. Parse resume if not already done ────────────────────────────────────
  let parsedResume = resume.parsed_data as ParsedResume
  if (!parsedResume?.name) {
    try {
      if (resume.raw_text && resume.raw_text.length >= 50) {
        parsedResume = await parseResume(resume.raw_text)
      } else if (resume.file_url) {
        // Text extraction failed or yielded too little — parse the PDF directly with Claude
        const fileRes = await fetch(resume.file_url)
        if (!fileRes.ok) throw new Error('Could not download resume file from storage')
        const buffer = Buffer.from(await fileRes.arrayBuffer())
        parsedResume = await parseResumeFromPDF(buffer)
      } else {
        return NextResponse.json(
          { error: 'No resume text or file found. Please upload your resume again.' },
          { status: 400 }
        )
      }
      await Promise.all([
        admin.from('resumes').update({ parsed_data: parsedResume }).eq('id', resume.id),
        admin.from('profiles').update({
          full_name: parsedResume.name || undefined,
          phone: parsedResume.phone || undefined,
          location: parsedResume.location || undefined,
          summary: parsedResume.summary || undefined,
          skills: parsedResume.skills || [],
        }).eq('user_id', user.id),
      ])
    } catch (err) {
      const msg = apiErrMsg(err)
      console.error('[analyze] parse failed:', msg)
      return NextResponse.json(
        { error: `Resume parsing failed: ${msg}` },
        { status: 500 }
      )
    }
  }

  // Ensure arrays are always arrays (guards against malformed parsed_data in DB)
  parsedResume = {
    ...parsedResume,
    skills: Array.isArray(parsedResume.skills) ? parsedResume.skills : [],
    experience: Array.isArray(parsedResume.experience) ? parsedResume.experience : [],
    education: Array.isArray(parsedResume.education) ? parsedResume.education : [],
    certifications: Array.isArray(parsedResume.certifications) ? parsedResume.certifications : [],
  }

  // ── 2b. Generate headline if profile has none ──────────────────────────────
  try {
    const { data: profileRow } = await admin
      .from('profiles')
      .select('headline')
      .eq('user_id', user.id)
      .single()

    if (!profileRow?.headline) {
      const headline = await generateHeadline(parsedResume)
      console.log('[analyze] Generated Headline:', headline)
      if (headline) {
        await admin.from('profiles').update({ headline }).eq('user_id', user.id)
      }
    } else {
      console.log('[analyze] Headline already exists, skipping generation')
    }
  } catch (err) {
    console.error('[analyze] headline generation failed (non-fatal):', err)
  }

  // ── 3. Build Adzuna search query ────────────────────────────────────────────
  const recentTitle = parsedResume.experience?.[0]?.title ?? ''
  const topSkills = parsedResume.skills.slice(0, 4).join(' ')
  const searchQuery = `${recentTitle} ${topSkills}`.trim().slice(0, 100) || 'software engineer'

  console.log('[analyze] search query:', searchQuery)

  // ── 4. Fetch jobs from Adzuna ───────────────────────────────────────────────
  const adzuna = new AdzunaAdapter()
  if (!(await adzuna.isAvailable())) {
    return NextResponse.json(
      { error: 'ADZUNA_APP_ID / ADZUNA_APP_KEY not configured in .env.local' },
      { status: 500 }
    )
  }

  let jobs
  try {
    jobs = await adzuna.search({ title: searchQuery, location: '', countryCode: 'in', limit: 25 })
    if (!jobs.length) {
      const fallback = parsedResume.skills[0] ?? 'engineer'
      console.log('[analyze] Adzuna retry with fallback query:', fallback)
      jobs = await adzuna.search({ title: fallback, location: '', countryCode: 'in', limit: 25 })
    }
  } catch (err) {
    const msg = apiErrMsg(err)
    console.error('[analyze] Adzuna fetch failed:', msg)
    return NextResponse.json(
      { error: `Could not fetch jobs from Adzuna: ${msg}` },
      { status: 502 }
    )
  }

  console.log('[analyze] Adzuna returned', jobs?.length ?? 0, 'jobs')

  if (!jobs?.length) {
    return NextResponse.json({
      matchCount: 0,
      cvSuggestions: [],
      message: 'No jobs found on Adzuna India for your profile. Try the search form with a specific job title.',
    })
  }

  // ── 5. Upsert jobs into the jobs table ─────────────────────────────────────
  await admin.from('jobs').upsert(
    jobs.map((j) => ({
      external_id: j.externalId,
      source: j.source,
      title: j.title,
      company: j.company,
      location: j.location,
      description: j.description,
      url: j.url,
      salary: j.salary ?? null,
      requirements: {},
      scraped_at: new Date().toISOString(),
    })),
    { onConflict: 'external_id,source' }
  )

  const { data: dbJobs } = await admin
    .from('jobs')
    .select('id, external_id, source')
    .in('external_id', jobs.map((j) => j.externalId))

  const extToDbId = new Map((dbJobs ?? []).map((j) => [`${j.source}:${j.external_id}`, j.id]))

  // ── 6. AI batch reranking ───────────────────────────────────────────────────
  console.log('[analyze] starting Claude rerank for', jobs.length, 'jobs…')
  let ranked
  try {
    ranked = await rerankJobs(parsedResume, jobs)
    console.log('[analyze] rerank complete, top score:', ranked[0]?.score)
  } catch (err) {
    const msg = apiErrMsg(err)
    console.error('[analyze] rerank failed:', msg)
    return NextResponse.json(
      { error: `AI matching failed: ${msg}` },
      { status: 500 }
    )
  }

  const top15 = ranked.slice(0, 15)

  console.log(`[analyze] resume_id=${resume.id} jobs_fetched=${jobs.length} jobs_ranked=${ranked.length} top15_scores=${top15.map((r) => r.score).join(',')}`)

  // ── 7. Hard-delete ALL previous matches for this user ──────────────────────
  // Analysis is a full replacement — never merge with stale scores from a prior resume.
  const { error: deleteError } = await admin
    .from('job_matches')
    .delete()
    .eq('user_id', user.id)
  if (deleteError) console.error('[analyze] stale match delete error:', deleteError.message)
  else console.log('[analyze] cleared previous matches for user', user.id)

  // ── 8. Build fresh match rows ───────────────────────────────────────────────
  const jobMap = new Map(jobs.map((j) => [j.externalId, j]))

  const matchRows = top15
    .map((r) => {
      const job = jobMap.get(r.externalId)
      if (!job) return null
      const dbJobId = extToDbId.get(`${job.source}:${job.externalId}`)
      if (!dbJobId) return null
      return {
        user_id:          user.id,
        job_id:           dbJobId,
        similarity_score: r.score / 100,
        ai_score:         r.score,
        ai_reasoning:     JSON.stringify({ r: r.reasoning, ms: r.matched_skills ?? [], miss: r.missing_skills ?? [] }),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  console.log(`[analyze] inserting ${matchRows.length} fresh match rows (score >= filter applied client-side)`)

  const [matchResult, cvSuggestions] = await Promise.all([
    matchRows.length > 0
      ? admin.from('job_matches').insert(matchRows)
      : Promise.resolve({ error: null }),
    generateCvSuggestions(
      parsedResume,
      top15.map((r) => ({
        title:          jobMap.get(r.externalId)?.title ?? '',
        matched_skills: r.matched_skills ?? [],
        missing_skills: r.missing_skills ?? [],
      }))
    ),
  ])

  if (matchResult.error) {
    console.error('[analyze] match insert error:', matchResult.error.message)
  }

  if (cvSuggestions.length > 0) {
    await admin
      .from('resumes')
      .update({ parsed_data: { ...parsedResume, cv_suggestions: cvSuggestions } })
      .eq('id', resume.id)
  }

  console.log(`[analyze] done — resume_id=${resume.id} saved=${matchRows.length} matches`)

  await createNotification({
    userId: user.id,
    type: 'jobs',
    title: `${matchRows.length} new job${matchRows.length !== 1 ? 's' : ''} matching your profile`,
    body: 'Your resume was analysed and top matches have been ranked for you.',
    ctaLabel: 'View Jobs',
    ctaHref: '/matches',
  })

  return NextResponse.json({
    success: true,
    matchCount: matchRows.length,
    cvSuggestions,
  })
}
