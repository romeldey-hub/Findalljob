/* eslint-disable @typescript-eslint/no-explicit-any */

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  if (typeof (window as any).gtag !== 'function') return
  ;(window as any).gtag('event', name, params)
}

export const track = {
  resumeUpload:    ()                  => trackEvent('resume_upload'),
  jobSearch:       (query?: string)    => trackEvent('job_search',        { search_term: query }),
  aiAnalyzeClick:  ()                  => trackEvent('ai_analyze_click'),
  upgradeClick:    (location?: string) => trackEvent('upgrade_click',     { location }),

  // Apply funnel
  applyClick: (jobTitle?: string, source?: string) =>
    trackEvent('apply_click', { job_title: jobTitle, source }),

  // User navigated to the new tab (visibilitychange fired hidden within 5s)
  applySuccess: (jobTitle?: string, source?: string) =>
    trackEvent('apply_success', { job_title: jobTitle, source }),

  // User triggered the fallback modal (popup blocked or 5s elapsed, still visible)
  applyFailure: (jobTitle?: string, reason?: 'popup_blocked' | 'no_navigation' | 'manual') =>
    trackEvent('apply_failure', { job_title: jobTitle, reason }),
}
