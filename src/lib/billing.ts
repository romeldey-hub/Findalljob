import type { SupabaseClient } from '@supabase/supabase-js'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Returns the effective pro_until for a user.
 *
 * For legacy Pro users (subscription_status = 'pro', pro_until = null — users who paid
 * before migration 012 introduced the expiry column), this function writes pro_until = now+30d
 * to the DB and returns the new value so the current request treats them as Pro immediately.
 * The write is fire-and-forget; subsequent requests will find pro_until already set.
 */
export async function resolveProUntil(
  adminClient: SupabaseClient,
  userId: string,
  subscriptionStatus: string | null | undefined,
  proUntil: string | null | undefined,
): Promise<string | null> {
  if (proUntil != null) return proUntil

  if (subscriptionStatus === 'pro') {
    const backfilled = new Date(Date.now() + THIRTY_DAYS_MS).toISOString()
    void adminClient
      .from('profiles')
      .update({ pro_until: backfilled, cancel_at_period_end: false })
      .eq('user_id', userId)
    return backfilled
  }

  return null
}
