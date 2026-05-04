import type { NormalizedJob } from '@/types'
import type { JobSearchParams, JobSourceAdapter } from '../types'

export class JobSpyAdapter implements JobSourceAdapter {
  id = 'jobspy'
  name = 'JobSpy'
  priority = 4

  private endpoint = process.env.JOBSPY_API_URL

  async isAvailable(): Promise<boolean> {
    return Boolean(this.endpoint)
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    if (!this.endpoint) return []

    console.log(`[jobspy] POST ${this.endpoint}`)
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_name: ['indeed', 'linkedin', 'glassdoor', 'zip_recruiter'],
        search_term: params.title,
        location: params.location,
        results_wanted: params.limit ?? 20,
        country_indeed: params.countryCode === 'in' ? 'India' : undefined,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    console.log(`[jobspy] status=${response.status}`)
    if (!response.ok) throw new Error(`JobSpy API error: ${response.status}`)

    const data = await response.json()
    const rows = (Array.isArray(data) ? data : (data.jobs ?? data.data ?? [])) as Record<string, unknown>[]
    console.log(`[jobspy] received ${rows.length} jobs`)

    return rows
      .map((job, i): NormalizedJob => {
        const jobUrl = String(job.job_url ?? job.url ?? job.job_url_direct ?? '').trim()
        const applyUrl = String(job.job_url_direct ?? jobUrl).trim()
        return {
          externalId:  String(job.id ?? job.job_id ?? jobUrl ?? `jobspy-${Date.now()}-${i}`),
          source:      'jobspy',
          title:       String(job.title ?? '').trim(),
          company:     String(job.company ?? 'Unknown').trim(),
          location:    [job.location, job.city, job.state, job.country].filter(Boolean).join(', ') || params.location,
          description: String(job.description ?? '').replace(/\s+/g, ' ').trim(),
          url:         jobUrl || applyUrl,
          applyUrl:    applyUrl || jobUrl,
          postedAt:    job.date_posted ? new Date(String(job.date_posted)).toISOString() : undefined,
          salary:      [job.min_amount, job.max_amount, job.currency]
            .filter((v) => v !== null && v !== undefined && v !== '')
            .join(' ') || undefined,
        }
      })
      .filter((job) => job.externalId && job.title && job.url)
      .slice(0, params.limit ?? 20)
  }
}
