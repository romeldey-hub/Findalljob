import { NextRequest, NextResponse }       from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { JobSourceRouter }                 from '@/lib/jobs/router'
import { rerankJobs }                      from '@/lib/ai/reranker'
import { generateCvSuggestions }           from '@/lib/ai/suggestions'
import { computeVerifiedLabel }            from '@/types'
import type { ParsedResume, NormalizedJob } from '@/types'

export const maxDuration = 60

// ── Apify DB cache ────────────────────────────────────────────────────────────
// Before calling Apify (slow, expensive), check if we have recent results in
// the DB that already match this search query. Cache window = 2 hours.

const APIFY_SOURCES = ['apify', 'apify_indeed', 'apify_linkedin', 'apify_naukri', 'apify_apna']
const CACHE_TTL_MS  = 2 * 60 * 60 * 1000   // 2 hours
const MIN_CACHE_HIT = 5                      // min results to consider cache valid

async function getApifyDbCache(
  admin: ReturnType<typeof createAdminClient>,
  title:    string,
  location: string
): Promise<NormalizedJob[]> {
  const since    = new Date(Date.now() - CACHE_TTL_MS).toISOString()
  // Use the first significant keyword from the title (e.g. "Software" from "Software Engineer")
  const keyword  = title.trim().split(/\s+/)[0]
  const cityHint = location.split(',')[0].trim()

  const { data } = await admin
    .from('jobs')
    .select('external_id, source, title, company, location, description, url, apply_url, apply_status, salary, scraped_at')
    .in('source', APIFY_SOURCES)
    .gte('scraped_at', since)
    .ilike('title', `%${keyword}%`)
    .or(cityHint ? `location.ilike.%${cityHint}%` : 'location.neq.NULL')
    .order('scraped_at', { ascending: false })
    .limit(25)

  if (!data?.length) return []

  return data.map((j) => ({
    externalId:  j.external_id as string,
    source:      j.source as NormalizedJob['source'],
    title:       j.title as string,
    company:     j.company as string,
    location:    j.location as string,
    description: j.description as string,
    url:         j.url as string,
    applyUrl:    (j.apply_url ?? j.url) as string,
    salary:      j.salary as string | undefined,
  }))
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

  // ── 1. Fetch jobs (with Apify DB-cache short-circuit for fallback stage) ────
  let jobs:        NormalizedJob[] = []
  let sourcesUsed: string[]        = []
  let errors:      Array<{ source: string; error: string }> = []
  let fromCache = false

  if (fallback) {
    // FIX 5: Check DB before calling Apify
    const cached = await getApifyDbCache(admin, title, location)
    if (cached.length >= MIN_CACHE_HIT) {
      console.log(`[search:fallback] DB cache hit — ${cached.length} recent Apify jobs, skipping API call`)
      jobs        = cached
      sourcesUsed = ['Apify (cached)']
      fromCache   = true
    }
  }

  if (!fromCache) {
    const result = await new JobSourceRouter().search(
      { title, location, limit: limit ?? 25 },
      stage
    )
    jobs        = result.jobs
    sourcesUsed = result.sourcesUsed
    errors      = result.errors
  }

  console.log(`[search] ${jobs.length} jobs, sources=[${sourcesUsed.join(', ')}], errors=${errors.length}`)

  if (jobs.length === 0) {
    const message = errors.length > 0
      ? `Unable to fetch jobs right now (${errors.map((e) => e.source).join(', ')} failed). Try different keywords or use AI search.`
      : 'No jobs found. Try broader keywords — e.g. "Sales Manager" instead of "MEP Sales Head".'
    return NextResponse.json({ matches: [], cvSuggestions: [], jobCount: 0, sourcesUsed, errors, message })
  }

  // ── 2. Get active resume ────────────────────────────────────────────────────
  const { data: resume } = await supabase
    .from('resumes')
    .select('id, parsed_data, raw_text')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const parsedResume = resume?.parsed_data as ParsedResume | null

  if (!parsedResume?.name) {
    return NextResponse.json({
      matches: jobs.slice(0, 15).map((j, i) => ({
        id:             `noresume-${i}`,
        ai_score:       0,
        ai_reasoning:   'Upload and analyze your resume to get AI match scores.',
        matched_skills: [],
        missing_skills: [],
        job: {
          id:             j.externalId,
          title:          j.title,
          company:        j.company,
          location:       j.location,
          url:            j.url,
          apply_url:      j.applyUrl ?? j.url,
          apply_status:   'unverified',
          verified_label: 'unverified',
          source:         j.source,
          salary:         j.salary,
          description:    j.description,
        },
      })),
      cvSuggestions: [],
      jobCount:      jobs.length,
      sourcesUsed,
      noResume:      true,
    })
  }

  // ── 3. Upsert jobs ──────────────────────────────────────────────────────────
  if (!fromCache) {
    const baseRows = jobs.map((j) => ({
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
    const extRows = jobs.map((j, i) => ({ ...baseRows[i], apply_url: j.applyUrl ?? j.url, apply_status: 'unverified' }))

    let { error: upsertError } = await admin.from('jobs').upsert(extRows, { onConflict: 'external_id,source', ignoreDuplicates: false })
    if (upsertError && (upsertError.code === '42703' || upsertError.code === 'PGRST204' || upsertError.message?.includes('apply_url'))) {
      console.warn('[search] migration pending — retrying upsert without new columns')
      ;({ error: upsertError } = await admin.from('jobs').upsert(baseRows, { onConflict: 'external_id,source', ignoreDuplicates: false }))
    }
    if (upsertError) console.error('[search] upsert error:', upsertError.message)
  }

  // Fetch DB UUIDs + validation state for each job
  const { data: dbJobs } = await admin
    .from('jobs')
    .select('id, external_id, source, apply_url, apply_status, last_verified_at')
    .in('external_id', jobs.map((j) => j.externalId))

  const extToDb = new Map(
    (dbJobs ?? []).map((j) => [`${j.source}:${j.external_id}`, j])
  )
  console.log(`[search] resolved ${extToDb.size} DB records`)

  // ── 4. AI reranking ─────────────────────────────────────────────────────────
  const safeParsed = {
    ...parsedResume,
    skills:         Array.isArray(parsedResume.skills)         ? parsedResume.skills         : [],
    experience:     Array.isArray(parsedResume.experience)     ? parsedResume.experience     : [],
    education:      Array.isArray(parsedResume.education)      ? parsedResume.education      : [],
    certifications: Array.isArray(parsedResume.certifications) ? parsedResume.certifications : [],
  }

  let ranked
  try {
    ranked = await rerankJobs(safeParsed, jobs, resume?.raw_text ?? undefined)
    console.log(`[search] rerank produced ${ranked.length} results`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[search] rerank threw:', msg)
    return NextResponse.json({
      matches: jobs.slice(0, 15).map((j, i) => {
        const dbJob = extToDb.get(`${j.source}:${j.externalId}`)
        return {
          id: `fallback-${i}`,
          ai_score: 0, ai_reasoning: 'AI scoring temporarily unavailable.',
          matched_skills: [], missing_skills: [],
          job: {
            id:             dbJob?.id ?? j.externalId,
            title:          j.title, company: j.company,
            location:       j.location, url: j.url,
            apply_url:      dbJob?.apply_url ?? j.applyUrl ?? j.url,
            apply_status:   dbJob?.apply_status ?? 'unverified',
            verified_label: computeVerifiedLabel(dbJob?.apply_status, dbJob?.last_verified_at),
            source:         j.source, salary: j.salary, description: j.description,
          },
        }
      }),
      cvSuggestions: [], jobCount: jobs.length, sourcesUsed,
      errors: [{ source: 'AI', error: msg }],
      message: 'Jobs found but AI scoring failed. Results shown unscored.',
    })
  }

  // ── 5. Build response, excluding confirmed-broken links ─────────────────────
  const jobMap = new Map(jobs.map((j) => [j.externalId, j]))
  const top15  = ranked.slice(0, 15)

  const matches = top15
    .map((r) => {
      const job   = jobMap.get(r.externalId)
      if (!job) { console.warn(`[search] externalId ${r.externalId} not in jobMap`); return null }
      const dbJob = extToDb.get(`${job.source}:${job.externalId}`)

      if (dbJob?.apply_status === 'broken') {
        console.log(`[search] skipping confirmed-broken job: "${job.title}"`)
        return null
      }

      return {
        id:             dbJob ? `${user.id}-${dbJob.id}` : r.externalId,
        ai_score:       r.score,
        ai_reasoning:   r.reasoning,
        matched_skills: r.matched_skills,
        missing_skills: r.missing_skills,
        job: {
          id:             dbJob?.id ?? r.externalId,
          title:          job.title,
          company:        job.company,
          location:       job.location,
          url:            job.url,
          apply_url:      dbJob?.apply_url ?? job.applyUrl ?? job.url,
          apply_status:   dbJob?.apply_status ?? 'unverified',
          verified_label: computeVerifiedLabel(dbJob?.apply_status, dbJob?.last_verified_at),
          source:         job.source,
          salary:         job.salary,
          description:    job.description,
        },
      }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)

  console.log(`[search] returning ${matches.length} matches`)

  // ── 6. Persist matches + CV suggestions (non-blocking) ──────────────────────
  const matchRows = matches
    .filter((m) => m.job.id.length === 36)
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

  return NextResponse.json({ matches, cvSuggestions, jobCount: jobs.length, sourcesUsed, errors: errors.length ? errors : undefined })
}
