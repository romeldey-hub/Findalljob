/**
 * DB-backed per-user sliding-window rate limiter.
 *
 * Uses the rate_limit_windows table (migration 027) with an atomic
 * rate_limit_increment() RPC that:
 *   - buckets time into 1-minute windows
 *   - auto-cleans buckets older than 5 minutes
 *   - returns { count, allowed } in a single round-trip
 *
 * Design notes:
 * - Fails OPEN on DB error (request passes through) — prevents outages from
 *   blocking all AI calls; the credit system is the hard backstop.
 * - Per-user keys prevent legitimate users from being throttled by others.
 * - Per-IP keys catch pre-auth spam (anonymous or login brute-force paths).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

// ── Per-feature limits (requests per minute per user) ─────────────────────────

export const RATE_LIMITS: Record<string, number> = {
  quick_fix:        6,
  follow_up:        6,
  interview_eval:   10,
  job_manual:       5,
  job_expand:       3,
  resume_generate:  3,
  interview_next:   8,
  default:          12,
}

export interface RateLimitResult {
  allowed:           boolean
  count:             number
  limit:             number
  retryAfterSeconds: number
}

// ── checkRateLimit ────────────────────────────────────────────────────────────

export async function checkRateLimit(
  key:         string,
  feature:     string,
  adminClient: SupabaseClient,
): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[feature] ?? RATE_LIMITS.default

  try {
    const { data, error } = await adminClient.rpc('rate_limit_increment', {
      p_key:   key,
      p_limit: limit,
    })

    if (error) {
      console.warn(`[rate-limit] RPC error (fail open) | key=${key} | feature=${feature} | err=${error.message}`)
      return { allowed: true, count: 0, limit, retryAfterSeconds: 0 }
    }

    const row     = Array.isArray(data) ? data[0] : data
    const count   = (row?.count   as number)  ?? 1
    const allowed = (row?.allowed as boolean) ?? true

    if (!allowed) {
      console.warn(`[rate-limit] BLOCKED | key=${key} | feature=${feature} | count=${count} | limit=${limit}`)
    }

    return { allowed, count, limit, retryAfterSeconds: allowed ? 0 : 60 }
  } catch (err) {
    console.warn(`[rate-limit] unexpected error (fail open) | key=${key}`, err)
    return { allowed: true, count: 0, limit, retryAfterSeconds: 0 }
  }
}

// ── Key builders ──────────────────────────────────────────────────────────────

export function userRateLimitKey(userId: string, feature: string): string {
  return `user:${userId}:${feature}`
}

export function ipRateLimitKey(req: NextRequest, feature: string): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  return `ip:${ip}:${feature}`
}

// ── rateLimitResponse ─────────────────────────────────────────────────────────

export function rateLimitResponse(result: RateLimitResult) {
  return {
    error:             'Too many requests. Please wait before trying again.',
    retryAfterSeconds: result.retryAfterSeconds,
    limit:             result.limit,
  }
}
