import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { rerankJobs } from '@/lib/ai/reranker'
import { JobSourceRouter } from '@/lib/jobs/router'
import type { NormalizedJob, ParsedResume } from '@/types'

export const maxDuration = 300

function sanitizeQuery(q: string): string {
  return q.replace(/[/\\|&"'()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const cleaned = value?.trim()
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out
}

function addUnique(target: NormalizedJob[], seen: Set<string>, incoming: NormalizedJob[], perSourceLimit = 12) {
  const sourceCounts = new Map<string, number>()
  for (const job of incoming) {
    const sourceCount = sourceCounts.get(job.source) ?? 0
    if (sourceCount >= perSourceLimit) continue
    const key = `${job.source}:${job.externalId}`
    if (seen.has(key)) continue
    seen.add(key)
    target.push(job)
    sourceCounts.set(job.source, sourceCount + 1)
  }
}

export async function POST() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: resume, error: resumeError } = await supabase
    .from('resumes')
    .select('id, parsed_data, raw_text')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (resumeError || !resume) {
    return NextResponse.json({ error: 'No active resume found' }, { status: 404 })
  }

  const parsed = resume.parsed_data as ParsedResume
  if (!parsed?.name) {
    return NextResponse.json({ error: 'Resume is not parsed yet' }, { status: 400 })
  }

  const location = parsed.location?.trim() || 'India'
  const isIndiaProfile = /india|new delhi|delhi ncr|ncr|mumbai|bangalore|bengaluru|chennai|hyderabad|pune|kolkata|ahmedabad|jaipur|surat|lucknow|nagpur|indore|bhopal|patna|visakhapatnam|noida|gurgaon|gurugram/i
    .test(location)
  const countryCode = isIndiaProfile ? 'in' : undefined

  const queries = uniqueNonEmpty([
    ...(parsed.experience ?? []).map((exp) => sanitizeQuery(exp.title ?? '')),
    ...(parsed.skills ?? []).slice(0, 3).map(sanitizeQuery),
  ]).slice(0, 3)

  if (!queries.length) {
    return NextResponse.json({ added: 0, message: 'No expansion queries available' })
  }

  const router = new JobSourceRouter()
  const jobs: NormalizedJob[] = []
  const seen = new Set<string>()

  for (const query of queries) {
    const result = await router.search({ title: query, location, countryCode, limit: 25 }, 'fallback')
    addUnique(jobs, seen, result.jobs, 12)
    if (jobs.length >= 35) break
  }

  if (!jobs.length) {
    return NextResponse.json({ added: 0, message: 'No Apify jobs found' })
  }

  const jobRows = jobs.map((j) => ({
    external_id:  j.externalId,
    source:       j.source,
    title:        j.title,
    company:      j.company,
    location:     j.location,
    description:  j.description,
    url:          j.url,
    apply_url:    j.applyUrl ?? j.url,
    salary:       j.salary ?? null,
    requirements: {},
    scraped_at:   new Date().toISOString(),
    apply_status: 'unverified',
  }))

  const { error: upsertError } = await admin
    .from('jobs')
    .upsert(jobRows, { onConflict: 'external_id,source' })

  if (upsertError) {
    return NextResponse.json({ error: `Could not save expanded jobs: ${upsertError.message}` }, { status: 500 })
  }

  const { data: dbJobs, error: dbJobsError } = await admin
    .from('jobs')
    .select('id, external_id, source')
    .in('external_id', jobs.map((j) => j.externalId))

  if (dbJobsError) {
    return NextResponse.json({ error: `Could not load expanded jobs: ${dbJobsError.message}` }, { status: 500 })
  }

  const extToDbId = new Map((dbJobs ?? []).map((j) => [`${j.source}:${j.external_id}`, j.id as string]))
  const ranked = await rerankJobs(parsed, jobs, resume.raw_text ?? undefined)
  const jobMap = new Map(jobs.map((j) => [`${j.source}:${j.externalId}`, j]))

  const matchRows = ranked.slice(0, 12)
    .map((r) => {
      const job = jobMap.get(`${r.source}:${r.externalId}`)
      if (!job) return null
      const jobId = extToDbId.get(`${job.source}:${job.externalId}`)
      if (!jobId) return null
      return {
        user_id:          user.id,
        job_id:           jobId,
        similarity_score: r.score / 100,
        ai_score:         r.score,
        ai_reasoning:     JSON.stringify({ r: r.reasoning, bridge: r.bridge_advice ?? '', mr: r.match_reasons ?? [], ms: r.matched_skills ?? [], miss: r.missing_skills ?? [] }),
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  if (!matchRows.length) {
    return NextResponse.json({ added: 0, message: 'No expanded matches scored' })
  }

  const { error: matchError } = await admin
    .from('job_matches')
    .upsert(matchRows, { onConflict: 'user_id,job_id' })

  if (matchError) {
    return NextResponse.json({ error: `Could not save expanded matches: ${matchError.message}` }, { status: 500 })
  }

  return NextResponse.json({ added: matchRows.length })
}
