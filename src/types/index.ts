// ─── Resume ───────────────────────────────────────────────────────────────────

export interface ResumeExperience {
  company: string
  title: string
  start_date: string
  end_date: string | null
  bullets: string[]
}

export interface ResumeEducation {
  school: string
  degree: string
  field: string
  graduation_year: string
}

export interface ParsedResume {
  name: string
  email: string
  phone: string
  location: string
  summary: string
  skills: string[]
  experience: ResumeExperience[]
  education: ResumeEducation[]
  certifications: string[]
  /**
   * Lossless section map: every section found in the original resume,
   * including Languages, Personal Details, Declaration, and any custom sections.
   * Used to pass complete content to AI optimization.
   */
  sections?: Array<{ title: string; content: string }>
}

export interface Resume {
  id: string
  user_id: string
  file_url: string
  raw_text: string
  parsed_data: ParsedResume
  version: number
  is_active: boolean
  created_at: string
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

/** Tier 1: direct ATS | Tier 2: Apify platform | Tier 3: aggregators */
export type JobSource =
  | 'greenhouse' | 'lever' | 'workable'           // Tier 1
  | 'apify_indeed' | 'apify_linkedin'             // Tier 2
  | 'apify_naukri' | 'apify_apna' | 'apify_upwork' | 'apify'  // Tier 2 (apify = legacy)
  | 'adzuna' | 'jsearch'                          // Tier 3
  | 'manual'

export type ApplyStatus = 'active' | 'broken' | 'unverified'

/**
 * UI-facing freshness label derived from apply_status + last_verified_at.
 * - verified: active + verified within 48 h
 * - stale:    active + not verified recently (old check or never)
 * - unverified: never checked
 */
export type VerifiedLabel = 'verified' | 'stale' | 'unverified'

/** Source tier used for sorting (lower = higher priority) */
export const SOURCE_TIER: Record<JobSource, 1 | 2 | 3> = {
  greenhouse: 1, lever: 1, workable: 1,
  apify_indeed: 2, apify_linkedin: 2, apify_naukri: 2, apify_apna: 2, apify_upwork: 2, apify: 2,
  adzuna: 3, jsearch: 3,
  manual: 1, // manual always surfaces first
}

/** Compute the UI-facing verification label from DB fields. */
export function computeVerifiedLabel(
  applyStatus: ApplyStatus | undefined,
  lastVerifiedAt: string | null | undefined
): VerifiedLabel {
  if (applyStatus !== 'active') return 'unverified'
  if (!lastVerifiedAt) return 'stale'
  const ageMs = Date.now() - new Date(lastVerifiedAt).getTime()
  return ageMs < 48 * 60 * 60 * 1000 ? 'verified' : 'stale'
}

/**
 * Freshness score for ranking: higher = better.
 * source_tier (0–60) + recency (0–40)
 */
export function computeFreshnessScore(job: {
  source: JobSource
  postedAt?: string | null
}): number {
  const tierScore = (4 - SOURCE_TIER[job.source]) * 20  // tier1→60, tier2→40, tier3→20
  let recencyScore = 10 // no date → weakly fresh
  if (job.postedAt) {
    const ageDays = (Date.now() - new Date(job.postedAt).getTime()) / 86_400_000
    recencyScore = ageDays < 1 ? 40 : ageDays < 3 ? 28 : ageDays < 7 ? 16 : ageDays < 14 ? 6 : 0
  }
  return tierScore + recencyScore
}

/** Canonical dedup key: md5-equivalent string for cross-source comparison. */
export function computeCanonicalKey(company: string, title: string, location: string): string {
  const norm  = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60)
  const city  = location.split(',')[0]
  return `${norm(company)}|${norm(title)}|${norm(city)}`
}

export interface NormalizedJob {
  externalId: string
  source: JobSource
  title: string
  company: string
  location: string
  description: string
  /** Job listing page URL (for viewing the detail page) */
  url: string
  /** Direct apply endpoint — ATS URL if available, else same as url */
  applyUrl?: string
  postedAt?: string
  salary?: string
}

export interface Job {
  id: string
  external_id: string
  source: JobSource
  title: string
  company: string
  location: string
  description: string
  url: string
  apply_url?: string
  apply_status?: ApplyStatus
  salary?: string
  requirements: Record<string, unknown>
  scraped_at: string
  created_at: string
}

export interface JobMatch {
  id: string
  user_id: string
  job_id: string
  job: Job
  similarity_score: number
  ai_score: number
  ai_reasoning: string
  matched_skills: string[]
  missing_skills: string[]
  created_at: string
}

// ─── Applications ─────────────────────────────────────────────────────────────

export type ApplicationStatus =
  | 'saved'
  | 'applied'
  | 'phone_screen'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'ghosted'

export type ApplyMethod = 'redirect' | 'assisted' | 'auto_email'

export interface FollowUpMessage {
  type: 'initial_outreach' | 'follow_up' | 'thank_you' | 'networking'
  content: string
  generated_at: string
}

export interface Application {
  id: string
  user_id: string
  job_id: string
  job: Job
  status: ApplicationStatus
  applied_at: string | null
  apply_method: ApplyMethod | null
  notes: string
  follow_up_messages: FollowUpMessage[]
  created_at: string
  updated_at: string
}

// ─── Optimized Resume ─────────────────────────────────────────────────────────

export interface OptimizedResume {
  id: string
  user_id: string
  job_id: string
  base_resume_id: string
  optimized_text: string
  file_url: string | null
  created_at: string
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  user_id: string
  full_name: string
  email: string
  phone: string
  location: string
  summary: string
  skills: string[]
  allow_apify_scraping: boolean
  created_at: string
  updated_at: string
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'free' | 'pro' | 'cancelled'

export interface UserSubscription {
  status: SubscriptionStatus
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  ai_actions_used: number
  ai_actions_limit: number
}
