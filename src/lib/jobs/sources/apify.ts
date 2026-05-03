import type { JobSourceAdapter, JobSearchParams } from '../types'
import type { NormalizedJob, JobSource } from '@/types'

/**
 * Apify adapter — supports multiple platform-specific actors/tasks.
 *
 * Configuration via env vars:
 *   APIFY_API_TOKEN        — required for any Apify request
 *   APIFY_TASK_ID          — Apify Task ID for Indeed scraper (preferred)
 *   APIFY_LINKEDIN_TASK_ID — Apify Task ID for LinkedIn Jobs scraper
 *   APIFY_NAUKRI_TASK_ID   — Apify Task ID for Naukri scraper
 *   APIFY_APNA_TASK_ID     — Apify Task ID for Apna scraper
 *
 * When a task ID is not set, the adapter for that platform is skipped.
 * The Indeed adapter falls back to the public misceres~indeed-scraper actor
 * when APIFY_TASK_ID is absent.
 */

const APIFY_BASE = 'https://api.apify.com/v2'

interface ApifyConfig {
  source:  JobSource
  taskId?: string
  actorId?: string      // fallback public actor (used when taskId is absent)
  buildInput: (params: JobSearchParams) => Record<string, unknown>
}

const PLATFORM_CONFIGS: ApifyConfig[] = [
  {
    source:  'apify_indeed',
    taskId:  process.env.APIFY_TASK_ID,
    actorId: 'misceres~indeed-scraper',
    buildInput: (p) => ({
      position: p.title,
      location: p.location,
      keyword:  p.title,
      maxItems: p.limit ?? 20,
    }),
  },
  {
    source:  'apify_linkedin',
    taskId:  process.env.APIFY_LINKEDIN_TASK_ID,
    actorId: 'curious_coder~linkedin-jobs-scraper',  // public fallback — no task setup needed
    // Actor requires pre-built LinkedIn search URLs, not separate keyword/location fields
    buildInput: (p) => {
      const kw  = encodeURIComponent(p.title)
      const loc = encodeURIComponent(p.location || 'India')
      return {
        urls:          [`https://www.linkedin.com/jobs/search/?keywords=${kw}&location=${loc}&f_TPR=r2592000`],
        count:         25,
        scrapeCompany: false,   // skip company detail pages — faster, stays within 50 s timeout
      }
    },
  },
  {
    source:  'apify_naukri',
    taskId:  process.env.APIFY_NAUKRI_TASK_ID,
    actorId: 'muhammetakkurtt~naukri-job-scraper',  // public fallback — no task setup needed
    buildInput: (p) => ({
      keyword:   p.title,
      maxJobs:   50,       // actor minimum is 50; reranker filters down
      freshness: '30',     // jobs posted in last 30 days
      sortBy:    'date',
    }),
  },
  {
    source: 'apify_apna',
    taskId: process.env.APIFY_APNA_TASK_ID,
    buildInput: (p) => ({
      query:    p.title,
      location: p.location,
      maxItems: p.limit ?? 20,
    }),
  },
  {
    source:  'apify_upwork',
    taskId:  process.env.APIFY_UPWORK_TASK_ID,
    actorId: 'neatrat~upwork-job-scraper',  // public fallback — no task setup needed
    buildInput: (p) => ({
      query:    p.title,
      maxItems: p.limit ?? 20,
    }),
  },
]

export class ApifyAdapter implements JobSourceAdapter {
  id       = 'apify'
  name     = 'Apify'
  priority = 2

  private token = process.env.APIFY_API_TOKEN!

  async isAvailable(): Promise<boolean> {
    return Boolean(this.token)
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const activePlatforms = PLATFORM_CONFIGS.filter(cfg => cfg.taskId || cfg.actorId)

    const settled = await Promise.allSettled(
      activePlatforms.map(async (cfg) => {
        const items = cfg.taskId
          ? await this.runTask(cfg.taskId, cfg.buildInput(params))
          : await this.runActor(cfg.actorId!, cfg.buildInput(params))
        const normalized = this.normalize(items, cfg.source, params)
        console.log(`[apify:${cfg.source}] normalized ${normalized.length} jobs`)
        return normalized
      })
    )

    const results: NormalizedJob[] = []
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(...r.value)
      else console.error(`[apify] platform failed:`, r.reason instanceof Error ? r.reason.message : r.reason)
    }
    return results
  }

  // ── Task endpoint ────────────────────────────────────────────────────────────

  private async runTask(
    taskId: string,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>[]> {
    const url = `${APIFY_BASE}/actor-tasks/${taskId}/run-sync-get-dataset-items`
    console.log(`[apify] POST task=${taskId}`, { keyword: input.keyword ?? input.position ?? input.keywords })

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
      body:    JSON.stringify(input),
      signal:  AbortSignal.timeout(30_000),
    })

    console.log(`[apify] task ${taskId} → status=${res.status}`)
    if (!res.ok) throw new Error(`Apify task ${taskId} failed: ${res.status}`)

    const data = await res.json()
    const items: Record<string, unknown>[] = Array.isArray(data) ? data : (data?.items ?? [])
    console.log(`[apify] task ${taskId} → ${items.length} raw items`)
    return items
  }

  // ── Actor endpoint (Indeed fallback) ─────────────────────────────────────────

  private async runActor(
    actorId: string,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>[]> {
    const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`
    console.log(`[apify] POST actor=${actorId}`)

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
      body:    JSON.stringify(input),
      signal:  AbortSignal.timeout(30_000),
    })

    console.log(`[apify] actor ${actorId} → status=${res.status}`)
    if (!res.ok) throw new Error(`Apify actor ${actorId} failed: ${res.status}`)

    const data  = await res.json()
    const items: Record<string, unknown>[] = Array.isArray(data) ? data : []
    console.log(`[apify] actor ${actorId} → ${items.length} raw items`)
    return items
  }

  // ── Normalization ────────────────────────────────────────────────────────────

  private normalize(
    items: Record<string, unknown>[],
    source: JobSource,
    params: JobSearchParams
  ): NormalizedJob[] {
    return items
      .map((job, i): NormalizedJob => {
        // Listing page (for viewing the job detail)
        // jdURL = Naukri; jobUrl = LinkedIn
        const listingUrl = String(
          job.url ?? job.link ?? job.jobUrl ?? job.jdURL ?? ''
        ).trim()

        // Direct apply URL — ATS endpoint preferred over aggregator listing
        const directApplyUrl = String(
          job.externalApplyLink ??
          job.applyUrl          ??
          job.apply_link        ??
          job.job_apply_link    ??
          job.applyLink         ??
          ''
        ).trim()

        return {
          // jobId = Naukri; id = LinkedIn/Upwork/generic; jobkey/job_id = Indeed/JSearch
          externalId: String(
            job.jobkey ?? job.job_id ?? job.jobId ?? job.id ?? `${source}-${Date.now()}-${i}`
          ),
          source,
          // jobTitle = Naukri/LinkedIn; positionName = Indeed; title = generic/Upwork
          title:       String(job.positionName ?? job.jobTitle ?? job.title ?? job.job_title ?? '').trim(),
          // companyName = Naukri/LinkedIn; clientName = Upwork; company/employer_name = other sources
          company:     String(job.company ?? job.companyName ?? job.clientName ?? job.employer_name ?? 'Unknown').trim(),
          location:    String(job.location ?? job.job_city ?? job.job_location ?? params.location).trim(),
          // jobDescription = Naukri; description/snippet = generic/Upwork
          description: String(job.description ?? job.jobDescription ?? job.snippet ?? job.job_description ?? '').trim(),
          // Prefer listing URL for url; use direct ATS link for applyUrl
          url:      listingUrl || directApplyUrl,
          applyUrl: directApplyUrl || listingUrl,
          postedAt: job.postedAt ?? job.datePosted
            ? new Date(String(job.postedAt ?? job.datePosted)).toISOString()
            : undefined,
          salary: (job.salary ?? job.budget)
            ? String(job.salary ?? job.budget)
            : undefined,
        }
      })
      .filter((j) => j.title.length > 0 && j.externalId.length > 0)
  }
}
