import type { NormalizedJob } from '@/types'

export interface JobSearchParams {
  title: string
  location: string
  limit?: number
  countryCode?: string
}

export interface JobSourceAdapter {
  id: string
  name: string
  priority: number
  isAvailable(): Promise<boolean>
  search(params: JobSearchParams): Promise<NormalizedJob[]>
}
