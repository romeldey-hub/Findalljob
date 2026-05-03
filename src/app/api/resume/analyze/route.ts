import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { parseResume, parseResumeFromPDF, generateHeadline } from '@/lib/ai/parser'
import { rerankJobs } from '@/lib/ai/reranker'
import { generateCvSuggestions } from '@/lib/ai/suggestions'
import { JobSourceRouter } from '@/lib/jobs/router'
import { createNotification } from '@/lib/notifications'
import type { ParsedResume, NormalizedJob } from '@/types'

export const maxDuration = 300

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

  // ── 3. Build search query ────────────────────────────────────────────────────
  // Use job title only — adding skills to the query hurts recall on Adzuna/JSearch
  const recentTitle     = parsedResume.experience?.[0]?.title?.trim() ?? ''
  const profileLocation = parsedResume.location?.trim() || 'India'
  const primaryQuery    = recentTitle || parsedResume.skills?.[0] || 'software engineer'
  // Broad fallback: first word of the title (e.g. "Sales" from "Senior Sales Manager")
  const broadQuery      = recentTitle.split(/\s+/).slice(-2).join(' ') || primaryQuery

  console.log('[analyze] primaryQuery:', primaryQuery, '| location:', profileLocation)

  // ── 4. Fetch jobs via multi-source router (Adzuna → JSearch → Apify) ────────
  const router = new JobSourceRouter()
  let jobs: NormalizedJob[] = []

  // 4a. Primary sources: Adzuna + JSearch in waterfall
  try {
    const r = await router.search({ title: primaryQuery, location: profileLocation, limit: 25 }, 'primary')
    jobs = r.jobs
    console.log('[analyze] primary sources returned', jobs.length, 'jobs from', r.sourcesUsed.join(', ') || 'none')
  } catch (err) {
    console.error('[analyze] primary router error:', apiErrMsg(err))
  }

  // 4b. Broaden title if primary returned too few (e.g. very specific title like "MEP Sales Head")
  if (jobs.length < 5 && broadQuery !== primaryQuery) {
    console.log('[analyze] broadening query to:', broadQuery)
    try {
      const r = await router.search({ title: broadQuery, location: profileLocation, limit: 25 }, 'primary')
      if (r.jobs.length > jobs.length) {
        jobs = r.jobs
        console.log('[analyze] broad query returned', jobs.length, 'jobs')
      }
    } catch (err) {
      console.error('[analyze] broad query error:', apiErrMsg(err))
    }
  }

  // 4c. Apify fallback if primary sources insufficient
  if (jobs.length < 5) {
    console.log('[analyze] primary sources insufficient — trying Apify fallback')
    try {
      const r = await router.search({ title: primaryQuery, location: profileLocation, limit: 25 }, 'fallback')
      if (r.jobs.length > 0) {
        jobs = [...jobs, ...r.jobs]
        console.log('[analyze] Apify added', r.jobs.length, 'jobs, total now', jobs.length)
      }
    } catch (err) {
      console.error('[analyze] Apify fallback error:', apiErrMsg(err))
    }
  }

  console.log('[analyze] total jobs fetched:', jobs.length)

  if (!jobs.length) {
    return NextResponse.json({
      matchCount: 0,
      cvSuggestions: [],
      message: `No jobs found for "${primaryQuery}". Try the search form above with a specific job title and location.`,
    })
  }

  // ── 5. Upsert jobs into the jobs table ─────────────────────────────────────
  const baseJobRows = jobs.map((j) => ({
    external_id:  j.externalId,
    source:       j.source,
    title:        j.title,
    company:      j.company,
    location:     j.location,
    description:  j.description,
    url:          j.url,
    salary:       j.salary ?? null,
    requirements: {},
    scraped_at:   new Date().toISOString(),
  }))
  const extendedJobRows = jobs.map((j, i) => ({
    ...baseJobRows[i],
    apply_url:    j.applyUrl ?? j.url,
    apply_status: 'unverified',
  }))

  let { error: upsertErr } = await admin.from('jobs').upsert(extendedJobRows, { onConflict: 'external_id,source' })
  if (upsertErr && (upsertErr.code === '42703' || upsertErr.code === 'PGRST204' || upsertErr.message?.includes('apply_url'))) {
    console.warn('[analyze] migration pending — retrying upsert without new columns')
    ;({ error: upsertErr } = await admin.from('jobs').upsert(baseJobRows, { onConflict: 'external_id,source' }))
  }
  if (upsertErr) console.error('[analyze] jobs upsert error:', upsertErr.message)

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
