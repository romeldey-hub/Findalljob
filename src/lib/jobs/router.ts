import type { NormalizedJob } from '@/types'
import { SOURCE_TIER, computeCanonicalKey, computeFreshnessScore } from '@/types'
import type { JobSourceAdapter, JobSearchParams } from './types'
import { AdzunaAdapter }  from './sources/adzuna'
import { JSearchAdapter } from './sources/jsearch'
import { ApifyAdapter }   from './sources/apify'
import { JobSpyAdapter }  from './sources/jobspy'
import { ManualAdapter }  from './sources/manual'
import {
  ArbeitnowAdapter,
  HimalayasAdapter,
  JobicyAdapter,
  RemoteOkAdapter,
} from './sources/public-free'

const MIN_ACCEPTABLE_RESULTS  = 10
const APIFY_FALLBACK_THRESHOLD = 5  // only use Apify when free sources return fewer than this

export type SearchStage = 'primary' | 'fallback'

export interface RouterResult {
  jobs:        NormalizedJob[]
  sourcesUsed: string[]
  errors:      Array<{ source: string; error: string }>
}

interface SearchAllOptions {
  includeApify?: boolean
}

export class JobSourceRouter {
  private primarySources:  JobSourceAdapter[]
  private fallbackSources: JobSourceAdapter[]
  private apifySources:    JobSourceAdapter[]

  constructor() {
    this.primarySources  = [new AdzunaAdapter(), new JSearchAdapter()]
    this.fallbackSources = [
      new HimalayasAdapter(),
      new JobicyAdapter(),
      new RemoteOkAdapter(),
      new ArbeitnowAdapter(),
      new JobSpyAdapter(),
    ]
    this.apifySources = [new ApifyAdapter()]
    void ManualAdapter
  }

  async searchAll(params: JobSearchParams, options: SearchAllOptions = {}): Promise<RouterResult> {
    const jobs:        NormalizedJob[]                          = []
    const sourcesUsed: string[]                                 = []
    const errors:      Array<{ source: string; error: string }> = []
    const sources = this.sourcesForAll(options)

    const settled = await Promise.all(
      sources.map(async (source) => {
        try {
          const available = await source.isAvailable()
          if (!available) {
            console.log(`[router:all] ${source.name} — skipped (no API key)`)
            return { source: source.name, jobs: [] as NormalizedJob[], error: null }
          }

          const results = await source.search(params)
          console.log(`[router:all] ${source.name} → ${results.length} jobs`)
          return { source: source.name, jobs: results, error: null }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          console.error(`[router:all] ${source.name} failed: ${msg}`)
          return { source: source.name, jobs: [] as NormalizedJob[], error: msg }
        }
      })
    )

    for (const result of settled) {
      if (result.jobs.length > 0) {
        jobs.push(...result.jobs)
        sourcesUsed.push(result.source)
      }
      if (result.error) errors.push({ source: result.source, error: result.error })
    }

    const urlDeduped   = this.dedupeByUrl(jobs)
    const canonDeduped = this.dedupeByCanonical(urlDeduped)
    const sorted       = this.sortByFreshness(canonDeduped)

    console.log(
      `[router:all] final: ${sorted.length} jobs ` +
      `(raw: ${jobs.length}, after url-dedup: ${urlDeduped.length}, after canonical-dedup: ${canonDeduped.length}) ` +
      `sources: [${sourcesUsed.join(', ') || 'none'}] errors: ${errors.length}`
    )

    return { jobs: sorted, sourcesUsed, errors }
  }

  async searchAllForScoring(params: JobSearchParams, options: SearchAllOptions = {}): Promise<RouterResult> {
    const jobs:        NormalizedJob[]                          = []
    const sourcesUsed: string[]                                 = []
    const errors:      Array<{ source: string; error: string }> = []
    const sources = this.sourcesForAll(options)

    const settled = await Promise.all(
      sources.map(async (source) => {
        try {
          const available = await source.isAvailable()
          if (!available) {
            console.log(`[router:score-pool] ${source.name} — skipped (no API key)`)
            return { source: source.name, jobs: [] as NormalizedJob[], error: null }
          }

          const results = await source.search(params)
          console.log(`[router:score-pool] ${source.name} → ${results.length} jobs`)
          return { source: source.name, jobs: results, error: null }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          console.error(`[router:score-pool] ${source.name} failed: ${msg}`)
          return { source: source.name, jobs: [] as NormalizedJob[], error: msg }
        }
      })
    )

    for (const result of settled) {
      if (result.jobs.length > 0) {
        jobs.push(...result.jobs)
        sourcesUsed.push(result.source)
      }
      if (result.error) errors.push({ source: result.source, error: result.error })
    }

    const sourceDeduped = this.dedupeBySourceExternalId(jobs)

    console.log(
      `[router:score-pool] final: ${sourceDeduped.length} jobs ` +
      `(raw: ${jobs.length}, after source-id dedup: ${sourceDeduped.length}) ` +
      `sources: [${sourcesUsed.join(', ') || 'none'}] errors: ${errors.length}`
    )

    return { jobs: sourceDeduped, sourcesUsed, errors }
  }

  async search(params: JobSearchParams, stage: SearchStage = 'primary'): Promise<RouterResult> {
    const jobs:        NormalizedJob[]                           = []
    const sourcesUsed: string[]                                  = []
    const errors:      Array<{ source: string; error: string }> = []

    if (stage === 'primary') {
      await this.collectFromSources(params, this.primarySources, stage, jobs, sourcesUsed, errors)
    } else {
      await this.collectFromSources(params, this.fallbackSources, stage, jobs, sourcesUsed, errors)

      const standardDedupedCount = this.dedupeByCanonical(this.dedupeByUrl(jobs)).length
      if (standardDedupedCount < APIFY_FALLBACK_THRESHOLD) {
        console.log(`[router:${stage}] standard fallback returned ${standardDedupedCount} usable jobs; trying Apify as final fallback`)
        await this.collectFromSources(params, this.apifySources, 'apify-final', jobs, sourcesUsed, errors)
      } else {
        console.log(`[router:${stage}] standard fallback returned ${standardDedupedCount} usable jobs; skipping Apify`)
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

  async searchSource(params: JobSearchParams, sourceId: string): Promise<RouterResult> {
    const source = [...this.primarySources, ...this.fallbackSources, ...this.apifySources].find((s) => s.id === sourceId)
    if (!source) return { jobs: [], sourcesUsed: [], errors: [{ source: sourceId, error: 'Unknown source' }] }

    try {
      const available = await source.isAvailable()
      if (!available) {
        console.log(`[router:source:${sourceId}] skipped (not available)`)
        return { jobs: [], sourcesUsed: [], errors: [] }
      }

      const results = await source.search(params)
      const deduped = this.dedupeBySourceExternalId(results)
      console.log(`[router:source:${sourceId}] final: ${deduped.length} jobs`)
      return { jobs: deduped, sourcesUsed: deduped.length ? [source.name] : [], errors: [] }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[router:source:${sourceId}] failed: ${msg}`)
      return { jobs: [], sourcesUsed: [], errors: [{ source: source.name, error: msg }] }
    }
  }

  private sourcesForAll(options: SearchAllOptions): JobSourceAdapter[] {
    const sources = [...this.primarySources, ...this.fallbackSources]
    if (options.includeApify) return [...sources, ...this.apifySources]
    return sources
  }

  private async collectFromSources(
    params: JobSearchParams,
    sources: JobSourceAdapter[],
    label: string,
    jobs: NormalizedJob[],
    sourcesUsed: string[],
    errors: Array<{ source: string; error: string }>
  ): Promise<void> {
    for (const source of sources) {
      if (jobs.length >= MIN_ACCEPTABLE_RESULTS) break

      try {
        const available = await source.isAvailable()
        if (!available) {
          console.log(`[router:${label}] ${source.name} — skipped (no API key)`)
          continue
        }

        const results = await source.search(params)
        console.log(`[router:${label}] ${source.name} → ${results.length} jobs`)

        if (results.length > 0) {
          jobs.push(...results)
          sourcesUsed.push(source.name)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[router:${label}] ${source.name} failed: ${msg}`)
        errors.push({ source: source.name, error: msg })
      }
    }
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

  private dedupeBySourceExternalId(jobs: NormalizedJob[]): NormalizedJob[] {
    const seen = new Set<string>()
    return jobs.filter((job) => {
      const key = `${job.source}:${job.externalId}`
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
