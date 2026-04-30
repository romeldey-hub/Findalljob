import type { JobSourceAdapter, JobSearchParams } from '../types'
import type { NormalizedJob } from '@/types'

export class JSearchAdapter implements JobSourceAdapter {
  id = 'jsearch'
  name = 'JSearch'
  priority = 2

  private apiKey = process.env.JSEARCH_RAPIDAPI_KEY!

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey)
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const query = encodeURIComponent(`${params.title} in ${params.location}`)
    const url   = `https://jsearch.p.rapidapi.com/search?query=${query}&num_pages=1&page=1&date_posted=week`

    console.log(`[jsearch] GET query="${params.title} in ${params.location}"`)

    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key':  this.apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    })

    console.log(`[jsearch] status=${response.status}`)

    if (response.status === 429) throw new Error('JSearch rate limit hit')
    if (!response.ok)            throw new Error(`JSearch API error: ${response.status}`)

    const data    = await response.json()
    const results = (data.data ?? []) as Record<string, unknown>[]
    console.log(`[jsearch] received ${results.length} jobs`)

    const parsed = results.slice(0, params.limit ?? 20).map((job) => ({
      externalId:  String(job.job_id ?? ''),
      source:      'jsearch' as const,
      title:       String(job.job_title ?? ''),
      company:     String(job.employer_name ?? 'Unknown'),
      location:    [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', '),
      description: String(job.job_description ?? ''),
      url:         String(job.job_apply_link ?? job.job_google_link ?? ''),
      postedAt:    job.job_posted_at_datetime_utc
        ? new Date(String(job.job_posted_at_datetime_utc)).toISOString()
        : undefined,
      salary: job.job_min_salary
        ? `$${Math.round(Number(job.job_min_salary) / 1000)}k – $${Math.round(Number(job.job_max_salary ?? job.job_min_salary) / 1000)}k`
        : undefined,
    }))

    // Drop entries that have no externalId (they'd collide in DB)
    const valid = parsed.filter((j) => j.externalId.length > 0)
    console.log(`[jsearch] valid after filter: ${valid.length}`)
    return valid
  }
}
