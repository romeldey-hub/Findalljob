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

export type JobSource = 'adzuna' | 'jsearch' | 'apify' | 'manual'

export interface NormalizedJob {
  externalId: string
  source: JobSource
  title: string
  company: string
  location: string
  description: string
  url: string
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
