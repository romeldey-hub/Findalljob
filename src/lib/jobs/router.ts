import type { NormalizedJob } from '@/types'
import { SOURCE_TIER, computeCanonicalKey, computeFreshnessScore } from '@/types'
import type { JobSourceAdapter, JobSearchParams } from './types'
import { AdzunaAdapter }  from './sources/adzuna'
import { JSearchAdapter } from './sources/jsearch'
import { ApifyAdapter }   from './sources/apify'
import { ManualAdapter }  from './sources/manual'

const MIN_ACCEPTABLE_RESULTS = 10

export type SearchStage = 'primary' | 'fallback'

export interface RouterResult {
  jobs:        NormalizedJob[]
  sourcesUsed: string[]
  errors:      Array<{ source: string; error: string }>
}

export class JobSourceRouter {
  private primarySources:  JobSourceAdapter[]
  private fallbackSources: JobSourceAdapter[]

  constructor() {
    this.primarySources  = [new AdzunaAdapter(), new JSearchAdapter()]
    this.fallbackSources = [new ApifyAdapter()]
    void ManualAdapter
  }

  async search(params: JobSearchParams, stage: SearchStage = 'primary'): Promise<RouterResult> {
    const sources = stage === 'primary' ? this.primarySources : this.fallbackSources

    const jobs:        NormalizedJob[]                           = []
    const sourcesUsed: string[]                                  = []
    const errors:      Array<{ source: string; error: string }> = []

    for (const source of sources) {
      if (jobs.length >= MIN_ACCEPTABLE_RESULTS) break

      try {
        const available = await source.isAvailable()
        if (!available) {
          console.log(`[router:${stage}] ${source.name} — skipped (no API key)`)
          continue
        }

        const results = await source.search(params)
        console.log(`[router:${stage}] ${source.name} → ${results.length} jobs`)

        if (results.length > 0) {
          jobs.push(...results)
          sourcesUsed.push(source.name)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[router:${stage}] ${source.name} failed: ${msg}`)
        errors.push({ source: source.name, error: msg })
      }
    }

    // 1. Deduplicate by apply URL
    const urlDeduped = this.dedupeByUrl(jobs)
    // 2. Deduplicate cross-source by canonical key (keeps higher-tier source)
    const canonDeduped = this.dedupeByCanonical(urlDeduped)
    // 3. Sort by freshness (source tier + recency)
    const sorted = this.sortByFreshness(canonDeduped)

    console.log(
      `[router:${stage}] final: ${sorted.length} jobs ` +
      `(raw: ${jobs.length}, after url-dedup: ${urlDeduped.length}, after canonical-dedup: ${canonDeduped.length}) ` +
      `sources: [${sourcesUsed.join(', ') || 'none'}] errors: ${errors.length}`
    )
    return { jobs: sorted, sourcesUsed, errors }
  }

  /** Remove exact-URL duplicates; prefer the one with an explicit applyUrl. */
  private dedupeByUrl(jobs: NormalizedJob[]): NormalizedJob[] {
    const seen = new Set<string>()
    return jobs.filter((job) => {
      const key = job.applyUrl || job.url
      if (!key) return true   // no URL — keep to avoid data loss
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  /**
   * Cross-source dedup: when two jobs share the same canonical key
   * (same company + title + city across different platforms), keep only
   * the one from the highest-priority source tier.
   */
  private dedupeByCanonical(jobs: NormalizedJob[]): NormalizedJob[] {
    const best = new Map<string, NormalizedJob>()

    for (const job of jobs) {
      const key = computeCanonicalKey(job.company, job.title, job.location)
      const existing = best.get(key)
      if (!existing) {
        best.set(key, job)
      } else {
        // Lower tier number = higher priority (Tier1 > Tier2 > Tier3)
        if (SOURCE_TIER[job.source] < SOURCE_TIER[existing.source]) {
          best.set(key, job)
        }
      }
    }

    return Array.from(best.values())
  }

  /** Sort by freshness score: combines source tier + posting recency. */
  private sortByFreshness(jobs: NormalizedJob[]): NormalizedJob[] {
    return [...jobs].sort(
      (a, b) => computeFreshnessScore(b) - computeFreshnessScore(a)
    )
  }
}
