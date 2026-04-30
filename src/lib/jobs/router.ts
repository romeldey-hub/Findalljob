import type { NormalizedJob } from '@/types'
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
    // ManualAdapter is triggered via a separate route — never used here
    void ManualAdapter
  }

  /**
   * stage='primary'  → try Adzuna first, then JSearch if insufficient.
   * stage='fallback' → try Apify only (caller already ran primary and got nothing).
   */
  async search(params: JobSearchParams, stage: SearchStage = 'primary'): Promise<RouterResult> {
    const sources = stage === 'primary' ? this.primarySources : this.fallbackSources

    const jobs:       NormalizedJob[]                           = []
    const sourcesUsed: string[]                                 = []
    const errors:     Array<{ source: string; error: string }> = []

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

    const deduped = this.dedupe(jobs)
    console.log(`[router:${stage}] final: ${deduped.length} jobs (sources: ${sourcesUsed.join(', ') || 'none'}, errors: ${errors.length})`)
    return { jobs: deduped, sourcesUsed, errors }
  }

  private dedupe(jobs: NormalizedJob[]): NormalizedJob[] {
    const seen = new Set<string>()
    return jobs.filter((job) => {
      const key = job.url || `${job.title}|${job.company}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
}
