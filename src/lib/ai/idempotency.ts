import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

type AcquireOptions = {
  userId: string
  feature: string
  keyParts: Array<string | number | boolean | null | undefined>
  ttlSeconds?: number
  metadata?: Record<string, unknown>
}

export type AiIdempotencyLock = {
  key: string
  acquired: boolean
}

export function buildAiIdempotencyKey(feature: string, keyParts: Array<string | number | boolean | null | undefined>) {
  const raw = [feature, ...keyParts.map((part) => String(part ?? ''))].join(':')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  return `${feature}:${hash}`
}

export async function acquireAiIdempotencyLock(
  admin: SupabaseClient,
  options: AcquireOptions,
): Promise<AiIdempotencyLock> {
  const key = buildAiIdempotencyKey(options.feature, [options.userId, ...options.keyParts])
  const now = new Date()
  const expiresAt = new Date(now.getTime() + (options.ttlSeconds ?? 600) * 1000).toISOString()

  await admin
    .from('ai_idempotency_keys')
    .delete()
    .lt('expires_at', now.toISOString())

  const { error } = await admin
    .from('ai_idempotency_keys')
    .insert({
      key,
      user_id: options.userId,
      feature: options.feature,
      status: 'running',
      metadata: options.metadata ?? {},
      expires_at: expiresAt,
    })

  if (!error) return { key, acquired: true }
  if (error.code === '23505' || /duplicate key/i.test(error.message ?? '')) {
    return { key, acquired: false }
  }
  console.error(`[ai-idempotency] acquire failed | feature=${options.feature}`, error)
  return { key, acquired: true }
}

export async function completeAiIdempotencyLock(
  admin: SupabaseClient,
  key: string,
  status: 'success' | 'failed' = 'success',
  metadata?: Record<string, unknown>,
) {
  const expiresAt = status === 'success'
    ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
    : new Date().toISOString()

  const { error } = await admin
    .from('ai_idempotency_keys')
    .update({
      status,
      expires_at: expiresAt,
      ...(metadata ? { metadata } : {}),
    })
    .eq('key', key)

  if (error) console.error(`[ai-idempotency] complete failed | key=${key}`, error)
}
