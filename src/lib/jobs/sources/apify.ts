import type { JobSourceAdapter, JobSearchParams } from '../types'
import type { NormalizedJob } from '@/types'

/**
 * Apify adapter — unconditional fallback source.
 * Prefers a pre-configured Task (APIFY_TASK_ID) so the actor + input are
 * managed on the Apify dashboard.  Falls back to the public indeed-scraper
 * actor when no task ID is set.
 */
export class ApifyAdapter implements JobSourceAdapter {
  id       = 'apify'
  name     = 'Apify'
  priority = 3

  private token  = process.env.APIFY_API_TOKEN!
  private taskId = process.env.APIFY_TASK_ID ?? ''

  async isAvailable(): Promise<boolean> {
    return Boolean(this.token)
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const items = this.taskId
      ? await this.runTask(params)
      : await this.runActor(params)

    const normalized = this.normalize(items, params)
    console.log(`[apify] normalized ${normalized.length} valid jobs`)
    return normalized
  }

  // ── Task endpoint (preferred — actor + defaults configured on Apify dashboard) ─

  private async runTask(params: JobSearchParams): Promise<Record<string, unknown>[]> {
    const url = `https://api.apify.com/v2/actor-tasks/${this.taskId}/run-sync-get-dataset-items`

    console.log(`[apify] POST task ${this.taskId} keyword="${params.title}" location="${params.location}"`)

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body:   JSON.stringify({ keyword: params.title, location: params.location }),
      signal: AbortSignal.timeout(50_000), // keep under 60s route limit
    })

    console.log(`[apify] task response status=${res.status}`)
    if (!res.ok) throw new Error(`Apify task ${this.taskId} failed: ${res.status}`)

    const data = await res.json()
    const items: Record<string, unknown>[] = Array.isArray(data) ? data : (data?.items ?? [])
    console.log(`[apify] task returned ${items.length} raw items`)
    return items
  }

  // ── Actor endpoint (fallback when no task ID is configured) ─────────────────

  private async runActor(params: JobSearchParams): Promise<Record<string, unknown>[]> {
    const actorId = 'misceres~indeed-scraper'
    const url     = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`

    console.log(`[apify] POST actor ${actorId} position="${params.title}" location="${params.location}"`)

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        position: params.title,
        location: params.location,
        maxItems: params.limit ?? 20,
      }),
      signal: AbortSignal.timeout(50_000),
    })

    console.log(`[apify] actor response status=${res.status}`)
    if (!res.ok) throw new Error(`Apify actor failed: ${res.status}`)

    const data = await res.json()
    const items: Record<string, unknown>[] = Array.isArray(data) ? data : []
    console.log(`[apify] actor returned ${items.length} raw items`)
    return items
  }

  // ── Normalization ────────────────────────────────────────────────────────────

  private normalize(items: Record<string, unknown>[], params: JobSearchParams): NormalizedJob[] {
    return items
      .map((job, i): NormalizedJob => ({
        externalId:   String(job.jobkey ?? job.job_id ?? job.id ?? `apify-${Date.now()}-${i}`),
        source:       'apify' as const,
        title:        String(job.positionName ?? job.title ?? job.job_title ?? '').trim(),
        company:      String(job.company ?? job.employer_name ?? 'Unknown').trim(),
        location:     String(job.location ?? job.job_city ?? job.job_location ?? params.location).trim(),
        description:  String(job.description ?? job.snippet ?? job.job_description ?? '').trim(),
        url:          String(job.url ?? job.applyUrl ?? job.apply_link ?? job.job_apply_link ?? '').trim(),
        postedAt:     job.postedAt ?? job.datePosted
          ? new Date(String(job.postedAt ?? job.datePosted)).toISOString()
          : undefined,
      }))
      .filter((j) => j.title.length > 0 && j.externalId.length > 0)
  }
}
