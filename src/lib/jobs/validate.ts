import type { ApplyStatus } from '@/types'

const TIMEOUT_MS   = 8_000
const MAX_ATTEMPTS = 3
const BATCH_SIZE   = 8
const BATCH_DELAY  = 600 // ms between concurrent batches

/**
 * HTML patterns that indicate a soft-404 / expired listing.
 * Checked against both <title> and the first 6 kB of body text.
 */
const DEAD_PAGE_PATTERNS: RegExp[] = [
  /\b(404|page\s+not\s+found|not\s+found)\b/i,
  /\bjob\s+(no\s+longer|is\s+no\s+longer|has\s+been|has\s+expired|closed|expired|removed|unavailable)\b/i,
  /\bposition\s+(has\s+been|is\s+no\s+longer|filled|closed|removed)\b/i,
  /\bposting\s+(has\s+been|is\s+no\s+longer|removed|expired)\b/i,
  /\bthis\s+(job|role|position|listing|opportunity)\s+(is\s+)?no\s+longer\b/i,
  /\bsorry[,.]?\s*(we\s+)?can'?t\s+find\b/i,
  /\bopportunity\s+(has|is)\s+(closed|no\s+longer)\b/i,
  /\bjob\s+listing\s+(removed|deleted|expired)\b/i,
]

/**
 * A single validation attempt using GET + redirect:manual.
 * - Follows redirects manually so we can inspect the final Location header.
 * - Downloads up to 6 kB of HTML to detect soft-404 pages.
 */
async function attemptValidation(url: string): Promise<ApplyStatus> {
  const res = await fetch(url, {
    method:   'GET',
    redirect: 'manual',   // handle 3xx ourselves
    signal:   AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  // ── 3xx redirect handling ──────────────────────────────────────────────────
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location') ?? ''

    // Redirect to an obvious error path → broken
    if (/\/(404|error|not[-_]?found|expired|removed|unavailable)/i.test(location)) {
      return 'broken'
    }
    // Redirect to login / auth wall → treat as active (requires auth to view)
    if (/\/(login|signin|sign-in|auth)/i.test(location)) {
      return 'active'
    }
    // All other redirects — assume the destination is live
    return 'active'
  }

  // ── 4xx → definitively broken ─────────────────────────────────────────────
  if (res.status === 404 || res.status === 410) return 'broken'
  if (res.status >= 400 && res.status < 500)    return 'broken'

  // ── 5xx → transient server error, not our fault ───────────────────────────
  if (res.status >= 500) return 'unverified'

  // ── 200: inspect HTML for soft-404 indicators ─────────────────────────────
  if (res.status === 200) {
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('text/html')) {
      // Read only the first 6 kB — enough for <head> + early <body>
      const reader = res.body?.getReader()
      let html = ''
      if (reader) {
        const { value } = await reader.read()
        if (value) html = new TextDecoder().decode(value).slice(0, 6_144)
        reader.cancel()  // don't download the rest
      }

      // Extract <title>
      const titleMatch = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i)
      const title = titleMatch?.[1]?.trim() ?? ''

      // Check title first (fastest), then body snippet
      for (const pattern of DEAD_PAGE_PATTERNS) {
        if (pattern.test(title) || pattern.test(html)) return 'broken'
      }
    }
    return 'active'
  }

  return 'unverified'
}

/**
 * Validate a single apply URL with up to MAX_ATTEMPTS retries.
 * Only definitively broken (4xx + HTML detection) counts as 'broken'.
 * Network errors / 5xx are retried, and stay 'unverified' after all attempts.
 */
export async function validateUrl(url: string): Promise<ApplyStatus> {
  if (!url) return 'broken'

  let lastResult: ApplyStatus = 'unverified'
  let delayMs = 1_000

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      lastResult = await attemptValidation(url)

      // Definitive answer — no need to retry
      if (lastResult === 'active' || lastResult === 'broken') return lastResult
    } catch {
      // Network error, timeout, DNS failure — retry
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, delayMs))
      delayMs *= 2 // exponential backoff: 1s → 2s
    }
  }

  // All attempts ended in network errors / transient issues
  return lastResult
}

/**
 * Validate a batch of {id, url} records in parallel groups.
 * Returns a Map of id → ApplyStatus.
 */
export async function validateUrlBatch(
  jobs: Array<{ id: string; url: string }>
): Promise<Map<string, ApplyStatus>> {
  const results = new Map<string, ApplyStatus>()

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE)

    const settled = await Promise.allSettled(
      batch.map(async (j) => ({ id: j.id, status: await validateUrl(j.url) }))
    )

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        results.set(item.value.id, item.value.status)
      }
    }

    if (i + BATCH_SIZE < jobs.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY))
    }
  }

  return results
}
