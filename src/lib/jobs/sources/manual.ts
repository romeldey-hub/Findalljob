import type { JobSourceAdapter, JobSearchParams } from '../types'
import type { NormalizedJob } from '@/types'
import { callClaudeJSON } from '@/lib/ai/claude'

export class ManualAdapter implements JobSourceAdapter {
  id = 'manual'
  name = 'Manual Entry'
  priority = 4

  // Manual adapter is always "available" — returns empty from search()
  // but has a separate parseJobPosting() method used by the manual paste UI
  async isAvailable(): Promise<boolean> {
    return true
  }

  // Not used in waterfall search — manual jobs come through the /api/jobs/manual route
  async search(_params: JobSearchParams): Promise<NormalizedJob[]> {
    return []
  }

  async parseJobPosting(text: string): Promise<NormalizedJob> {
    const result = await callClaudeJSON<{
      title: string
      company: string
      location: string
      description: string
      url: string
    }>(
      `Extract the job title, company name, location, full job description, and application URL from this job posting text.

      JOB POSTING:
      ${text.slice(0, 4000)}`,
      'Return a JSON object with keys: title, company, location, description, url'
    )

    return {
      externalId: `manual-${Date.now()}`,
      source: 'manual',
      title: result.title ?? '',
      company: result.company ?? '',
      location: result.location ?? '',
      description: result.description ?? text,
      url: result.url ?? '',
    }
  }
}
