import type { NormalizedJob } from '@/types'
import type { JobSearchParams, JobSourceAdapter } from '../types'

function stripHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 3)
}

function looksRelevant(params: JobSearchParams, job: Pick<NormalizedJob, 'title' | 'company' | 'description'>): boolean {
  const queryWords = words(params.title)
  if (!queryWords.length) return true
  const haystack = `${job.title} ${job.company} ${job.description}`.toLowerCase()
  return queryWords.some((word) => haystack.includes(word))
}

function salaryRange(min?: unknown, max?: unknown, currency?: unknown): string | undefined {
  if (min === null && max === null) return undefined
  if (min === undefined && max === undefined) return undefined
  const minNum = Number(min)
  const maxNum = Number(max)
  if (!Number.isFinite(minNum) && !Number.isFinite(maxNum)) return undefined
  const curr = String(currency ?? 'USD')
  if (Number.isFinite(minNum) && Number.isFinite(maxNum)) return `${curr} ${Math.round(minNum).toLocaleString()} - ${Math.round(maxNum).toLocaleString()}`
  const value = Number.isFinite(minNum) ? minNum : maxNum
  return `${curr} ${Math.round(value).toLocaleString()}`
}

function dateIso(value: unknown, unixSeconds = false): string | undefined {
  if (!value) return undefined
  const date = unixSeconds ? new Date(Number(value) * 1000) : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function limitJobs(params: JobSearchParams, jobs: NormalizedJob[]): NormalizedJob[] {
  return jobs
    .filter((job) => job.title && job.externalId && job.url)
    .filter((job) => looksRelevant(params, job))
    .slice(0, params.limit ?? 20)
}

export class HimalayasAdapter implements JobSourceAdapter {
  id = 'himalayas'
  name = 'Himalayas'
  priority = 4

  async isAvailable(): Promise<boolean> {
    return true
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const url = `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(params.title)}&sort=recent`
    console.log(`[himalayas] GET q="${params.title}"`)
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    console.log(`[himalayas] status=${response.status}`)
    if (!response.ok) throw new Error(`Himalayas API error: ${response.status}`)

    const data = await response.json()
    const results = (data.jobs ?? []) as Record<string, unknown>[]
    console.log(`[himalayas] received ${results.length} jobs`)

    return limitJobs(params, results.map((job): NormalizedJob => ({
      externalId:  String(job.guid ?? job.id ?? job.applicationLink ?? ''),
      source:      'himalayas',
      title:       String(job.title ?? '').trim(),
      company:     String(job.companyName ?? 'Unknown').trim(),
      location:    Array.isArray(job.locationRestrictions) && job.locationRestrictions.length
        ? (job.locationRestrictions as unknown[]).join(', ')
        : 'Remote',
      description: stripHtml(job.description ?? job.excerpt),
      url:         String(job.applicationLink ?? ''),
      applyUrl:    String(job.applicationLink ?? ''),
      postedAt:    dateIso(job.pubDate),
      salary:      salaryRange(job.minSalary, job.maxSalary, job.currency),
    })))
  }
}

export class JobicyAdapter implements JobSourceAdapter {
  id = 'jobicy'
  name = 'Jobicy'
  priority = 4

  async isAvailable(): Promise<boolean> {
    return true
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const count = Math.min(Math.max(params.limit ?? 20, 20), 100)
    const url = `https://jobicy.com/api/v2/remote-jobs?count=${count}&tag=${encodeURIComponent(params.title)}`
    console.log(`[jobicy] GET tag="${params.title}"`)
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    console.log(`[jobicy] status=${response.status}`)
    if (!response.ok) throw new Error(`Jobicy API error: ${response.status}`)

    const data = await response.json()
    const results = (data.jobs ?? []) as Record<string, unknown>[]
    console.log(`[jobicy] received ${results.length} jobs`)

    return limitJobs(params, results.map((job): NormalizedJob => ({
      externalId:  String(job.id ?? job.url ?? ''),
      source:      'jobicy',
      title:       String(job.jobTitle ?? '').trim(),
      company:     String(job.companyName ?? 'Unknown').trim(),
      location:    String(job.jobGeo ?? 'Remote').trim(),
      description: stripHtml(job.jobDescription ?? job.jobExcerpt),
      url:         String(job.url ?? ''),
      applyUrl:    String(job.url ?? ''),
      postedAt:    dateIso(job.pubDate),
      salary:      salaryRange(job.annualSalaryMin, job.annualSalaryMax, job.salaryCurrency),
    })))
  }
}

export class RemoteOkAdapter implements JobSourceAdapter {
  id = 'remoteok'
  name = 'RemoteOK'
  priority = 4

  async isAvailable(): Promise<boolean> {
    return true
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    console.log('[remoteok] GET latest remote jobs')
    const response = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'FindAllJob/1.0' },
      signal: AbortSignal.timeout(20_000),
    })
    console.log(`[remoteok] status=${response.status}`)
    if (!response.ok) throw new Error(`RemoteOK API error: ${response.status}`)

    const data = await response.json()
    const results = (Array.isArray(data) ? data : []).filter((item): item is Record<string, unknown> => {
      return typeof item === 'object' && item !== null && Boolean((item as Record<string, unknown>).id)
    })
    console.log(`[remoteok] received ${results.length} jobs`)

    return limitJobs(params, results.map((job): NormalizedJob => ({
      externalId:  String(job.id ?? job.slug ?? job.url ?? ''),
      source:      'remoteok',
      title:       String(job.position ?? '').trim(),
      company:     String(job.company ?? 'Unknown').trim(),
      location:    String(job.location ?? 'Remote').trim(),
      description: stripHtml(job.description),
      url:         String(job.url ?? ''),
      applyUrl:    String(job.apply_url ?? job.url ?? ''),
      postedAt:    dateIso(job.date),
      salary:      salaryRange(job.salary_min, job.salary_max, 'USD'),
    })))
  }
}

export class ArbeitnowAdapter implements JobSourceAdapter {
  id = 'arbeitnow'
  name = 'Arbeitnow'
  priority = 4

  async isAvailable(): Promise<boolean> {
    return true
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    console.log('[arbeitnow] GET latest jobs')
    const response = await fetch('https://www.arbeitnow.com/api/job-board-api', {
      signal: AbortSignal.timeout(20_000),
    })
    console.log(`[arbeitnow] status=${response.status}`)
    if (!response.ok) throw new Error(`Arbeitnow API error: ${response.status}`)

    const data = await response.json()
    const results = (data.data ?? []) as Record<string, unknown>[]
    console.log(`[arbeitnow] received ${results.length} jobs`)

    return limitJobs(params, results.map((job): NormalizedJob => ({
      externalId:  String(job.slug ?? job.url ?? ''),
      source:      'arbeitnow',
      title:       String(job.title ?? '').trim(),
      company:     String(job.company_name ?? 'Unknown').trim(),
      location:    String(job.location ?? (job.remote ? 'Remote' : 'Europe')).trim(),
      description: stripHtml(job.description),
      url:         String(job.url ?? ''),
      applyUrl:    String(job.url ?? ''),
      postedAt:    dateIso(job.created_at, true),
      salary:      undefined,
    })))
  }
}
