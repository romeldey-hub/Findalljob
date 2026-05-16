export const RESUME_PREPARING_MESSAGE = 'Resume is still preparing. Please try again in a moment.'
export const MIN_RESUME_EXPORT_TEXT_LENGTH = 100

type ResumeLike = {
  name?: string | null
  summary?: string | null
  skills?: string[] | null
  experience?: unknown[] | null
  education?: unknown[] | null
  certifications?: unknown[] | null
  additionalSections?: unknown[] | null
}

export function resumeHasExportableContent(data: ResumeLike | null | undefined) {
  if (!data) return false
  return Boolean(
    data.name?.trim() &&
    (
      data.summary?.trim() ||
      (data.experience?.length ?? 0) > 0 ||
      (data.skills?.length ?? 0) > 0 ||
      (data.education?.length ?? 0) > 0
    ),
  )
}

export function countResumeSections(data: ResumeLike | null | undefined) {
  if (!data) return 0
  let count = 0
  if (data.summary?.trim()) count += 1
  if ((data.experience?.length ?? 0) > 0) count += 1
  if ((data.skills?.length ?? 0) > 0) count += 1
  if ((data.education?.length ?? 0) > 0) count += 1
  if ((data.certifications?.length ?? 0) > 0) count += 1
  if ((data.additionalSections?.length ?? 0) > 0) count += data.additionalSections?.length ?? 0
  return count
}

export function renderedTextLength(node: HTMLElement | null | undefined) {
  return (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim().length
}

export function waitForResumeExportPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export function logResumeExportDebug(source: string, debug: Record<string, unknown>) {
  console.log(`[resume-pdf:${source}]`, debug)
}
