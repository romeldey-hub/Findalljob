export const FREE_LIMITS = {
  resumeUploads:       1,   // one upload/create for free accounts
  aiReanalyze:         1,   // 1 fresh AI match run per resume, lifetime (not daily)
  jobSearch:           3,
  matchesPerDay:       15,  // AI-ranked matches visible
  optimizationsPerDay: 1,   // general resume optimization previews
  aiAssistPerDay:      5,   // bullet-assist actions
} as const

export const PRO_LIMITS = {
  aiAssistPerDay: 20,
} as const
