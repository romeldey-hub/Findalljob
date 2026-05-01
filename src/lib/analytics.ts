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
  applyClick:      (jobTitle?: string) => trackEvent('apply_click',       { job_title: jobTitle }),
  upgradeClick:    (location?: string) => trackEvent('upgrade_click',     { location }),
}
