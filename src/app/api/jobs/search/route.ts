import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { JobSourceRouter }        from '@/lib/jobs/router'
import { rerankJobs }             from '@/lib/ai/reranker'
import { generateCvSuggestions }  from '@/lib/ai/suggestions'
import type { ParsedResume }      from '@/types'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, location, limit, fallback = false } = await request.json()
  if (!title || !location) {
    return NextResponse.json({ error: 'title and location are required' }, { status: 400 })
  }

  const stage = fallback ? 'fallback' : 'primary'
  console.log(`[search:${stage}] user=${user.id} title="${title}" location="${location}"`)

  // ── 1. Fetch jobs from available sources ───────────────────────────────────
  const router = new JobSourceRouter()
  const { jobs, sourcesUsed, errors } = await router.search(
    { title, location, limit: limit ?? 25 },
    stage
  )

  console.log(`[search] fetched ${jobs.length} jobs from [${sourcesUsed.join(', ')}], errors: ${errors.length}`)

  if (jobs.length === 0) {
    const hasApiErrors = errors.length > 0
    const message = hasApiErrors
      ? `Unable to fetch jobs right now (${errors.map((e) => e.source).join(', ')} failed). Try different keywords or use AI search.`
      : 'No jobs found. Try broader keywords — e.g. "Sales Manager" instead of "MEP Sales Head".'
    console.log(`[search] returning empty: ${message}`)
    return NextResponse.json({
      matches:      [],
      cvSuggestions: [],
      jobCount:     0,
      sourcesUsed,
      errors,
      message,
    })
  }

  // ── 2. Get active resume for AI matching ───────────────────────────────────
  const { data: resume } = await supabase
    .from('resumes')
    .select('id, parsed_data')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const parsedResume = resume?.parsed_data as ParsedResume | null

  // No resume — return unscored jobs so the user sees something
  if (!parsedResume?.name) {
    console.log(`[search] no resume — returning ${Math.min(jobs.length, 15)} unscored jobs`)
    return NextResponse.json({
      matches: jobs.slice(0, 15).map((j, i) => ({
        id:             `noresume-${i}`,
        ai_score:       0,
        ai_reasoning:   'Upload and analyze your resume to get AI match scores.',
        matched_skills: [],
        missing_skills: [],
        job: {
          id:          j.externalId,
          title:       j.title,
          company:     j.company,
          location:    j.location,
          url:         j.url,
          salary:      j.salary,
          description: j.description,
        },
      })),
      cvSuggestions: [],
      jobCount:      jobs.length,
      sourcesUsed,
      noResume:      true,
    })
  }

  // ── 3. Upsert jobs into DB ──────────────────────────────────────────────────
  const { error: upsertError } = await admin.from('jobs').upsert(
    jobs.map((j) => ({
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
    })),
    { onConflict: 'external_id,source' }
  )
  if (upsertError) console.error('[search] jobs upsert error:', upsertError.message)

  // Resolve external IDs → DB UUIDs
  const { data: dbJobs } = await admin
    .from('jobs')
    .select('id, external_id, source')
    .in('external_id', jobs.map((j) => j.externalId))

  const extToDbId = new Map((dbJobs ?? []).map((j) => [`${j.source}:${j.external_id}`, j.id]))
  console.log(`[search] resolved ${extToDbId.size} DB IDs`)

  // ── 4. AI batch reranking ───────────────────────────────────────────────────
  const safeParsed = {
    ...parsedResume,
    skills:         Array.isArray(parsedResume.skills)         ? parsedResume.skills         : [],
    experience:     Array.isArray(parsedResume.experience)     ? parsedResume.experience     : [],
    education:      Array.isArray(parsedResume.education)      ? parsedResume.education      : [],
    certifications: Array.isArray(parsedResume.certifications) ? parsedResume.certifications : [],
  }

  let ranked
  try {
    ranked = await rerankJobs(safeParsed, jobs)
    console.log(`[search] rerank produced ${ranked.length} results`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[search] rerank threw:', msg)
    // Fall back: return jobs unscored rather than failing
    return NextResponse.json({
      matches: jobs.slice(0, 15).map((j, i) => ({
        id:             `fallback-${i}`,
        ai_score:       0,
        ai_reasoning:   'AI scoring temporarily unavailable.',
        matched_skills: [],
        missing_skills: [],
        job: {
          id:          extToDbId.get(`${j.source}:${j.externalId}`) ?? j.externalId,
          title:       j.title,
          company:     j.company,
          location:    j.location,
          url:         j.url,
          salary:      j.salary,
          description: j.description,
        },
      })),
      cvSuggestions: [],
      jobCount:      jobs.length,
      sourcesUsed,
      errors:        [{ source: 'AI', error: msg }],
      message:       'Jobs found but AI scoring failed. Results shown unscored.',
    })
  }

  const top15 = ranked.slice(0, 15)
  console.log(`[search] top15 externalIds: ${top15.map((r) => r.externalId).join(', ')}`)

  // ── 5. Build matches ────────────────────────────────────────────────────────
  const jobMap = new Map(jobs.map((j) => [j.externalId, j]))

  const matches = top15
    .map((r) => {
      const job = jobMap.get(r.externalId)
      if (!job) {
        // Should not happen with index-based reranker, but guard anyway
        console.warn(`[search] ranked externalId "${r.externalId}" not found in jobMap`)
        return null
      }
      const dbJobId = extToDbId.get(`${job.source}:${job.externalId}`)
      return {
        id:             dbJobId ? `${user.id}-${dbJobId}` : r.externalId,
        ai_score:       r.score,
        ai_reasoning:   r.reasoning,
        matched_skills: r.matched_skills,
        missing_skills: r.missing_skills,
        job: {
          id:          dbJobId ?? r.externalId,
          title:       job.title,
          company:     job.company,
          location:    job.location,
          url:         job.url,
          salary:      job.salary,
          description: job.description,
        },
      }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)

  console.log(`[search] returning ${matches.length} matches to client`)

  // ── 6. Persist matches + generate suggestions (non-blocking, best-effort) ───
  const matchRows = matches
    .filter((m) => m.job.id.length === 36) // only real UUIDs
    .map((m) => ({
      user_id:          user.id,
      job_id:           m.job.id,
      similarity_score: m.ai_score / 100,
      ai_score:         m.ai_score,
      ai_reasoning:     JSON.stringify({ r: m.ai_reasoning, ms: m.matched_skills, miss: m.missing_skills }),
    }))

  let cvSuggestions: string[] = []
  try {
    const [, suggestions] = await Promise.all([
      matchRows.length > 0
        ? admin.from('job_matches').upsert(matchRows, { onConflict: 'user_id,job_id' })
        : Promise.resolve(),
      generateCvSuggestions(
        safeParsed,
        top15.map((r) => ({
          title:          jobMap.get(r.externalId)?.title ?? '',
          matched_skills: r.matched_skills,
          missing_skills: r.missing_skills,
        }))
      ),
    ])
    cvSuggestions = (suggestions as string[]) ?? []
  } catch (err) {
    console.error('[search] post-rank step failed:', err instanceof Error ? err.message : err)
  }

  return NextResponse.json({
    matches,
    cvSuggestions,
    jobCount:  jobs.length,
    sourcesUsed,
    errors:    errors.length ? errors : undefined,
  })
}
