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
  actorId?: string      // fallback actor (Indeed only)
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
    source: 'apify_linkedin',
    taskId: process.env.APIFY_LINKEDIN_TASK_ID,
    buildInput: (p) => ({
      keywords:  p.title,
      location:  p.location,
      maxItems:  p.limit ?? 20,
    }),
  },
  {
    source: 'apify_naukri',
    taskId: process.env.APIFY_NAUKRI_TASK_ID,
    buildInput: (p) => ({
      keyword:  p.title,
      location: p.location,
      maxItems: p.limit ?? 20,
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
    const results: NormalizedJob[] = []

    for (const cfg of PLATFORM_CONFIGS) {
      // Skip platforms without a configured task and no fallback actor
      if (!cfg.taskId && !cfg.actorId) continue

      try {
        const items = cfg.taskId
          ? await this.runTask(cfg.taskId, cfg.buildInput(params))
          : await this.runActor(cfg.actorId!, cfg.buildInput(params))

        const normalized = this.normalize(items, cfg.source, params)
        console.log(`[apify:${cfg.source}] normalized ${normalized.length} jobs`)
        results.push(...normalized)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[apify:${cfg.source}] failed: ${msg}`)
        // Continue to next platform on error
      }
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
      signal:  AbortSignal.timeout(50_000),
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
      signal:  AbortSignal.timeout(50_000),
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
        const listingUrl = String(
          job.url ?? job.link ?? job.jobUrl ?? ''
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
          externalId: String(
            job.jobkey ?? job.job_id ?? job.id ?? `${source}-${Date.now()}-${i}`
          ),
          source,
          title:       String(job.positionName ?? job.title ?? job.job_title ?? '').trim(),
          company:     String(job.company ?? job.employer_name ?? job.companyName ?? 'Unknown').trim(),
          location:    String(job.location ?? job.job_city ?? job.job_location ?? params.location).trim(),
          description: String(job.description ?? job.snippet ?? job.job_description ?? '').trim(),
          // Prefer listing URL for url; use direct ATS link for applyUrl
          url:      listingUrl || directApplyUrl,
          applyUrl: directApplyUrl || listingUrl,
          postedAt: job.postedAt ?? job.datePosted
            ? new Date(String(job.postedAt ?? job.datePosted)).toISOString()
            : undefined,
          salary: job.salary
            ? String(job.salary)
            : undefined,
        }
      })
      .filter((j) => j.title.length > 0 && j.externalId.length > 0)
  }
}
