export const FREE_LIMITS = {
  resumeUploads:       1,   // one upload/create for free accounts
  aiReanalyze:         3,   // full re-analyze pipeline runs
  jobSearch:           3,
  matchesPerDay:       15,  // AI-ranked matches visible
  optimizationsPerDay: 1,   // general resume optimization previews
  aiAssistPerDay:      5,   // bullet-assist actions
} as const

export const PRO_LIMITS = {
  aiAssistPerDay: 20,
} as const
