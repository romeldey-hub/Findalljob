import { createHash } from 'crypto'
import type { ParsedResume } from '@/types'

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

/**
 * Compute a stable hash from normalized parsed resume content.
 * Uses parsed fields (not raw PDF bytes) so the hash is consistent
 * across re-uploads of the same resume content.
 */
export function computeParsedResumeHash(parsed: ParsedResume): string {
  const parts = [
    norm(parsed.name),
    norm(parsed.email),
    [...(parsed.skills ?? [])].map(norm).sort().join(','),
    (parsed.experience ?? []).slice(0, 10).map(e =>
      `${norm(e.title)}|${norm(e.company)}`
    ).join(';'),
    (parsed.education ?? []).slice(0, 5).map(e =>
      `${norm(e.degree)}|${norm(e.school)}`
    ).join(';'),
  ]
  return createHash('sha256').update(parts.join('||')).digest('hex')
}
