import type { SupabaseClient } from '@supabase/supabase-js'

export const CREDIT_COSTS = {
  // ── Existing (do not change amounts) ────────────────────────────────────────
  jobOptimize:      2,
  interviewSession: 2,
  jobRerank:        1,
  aiAssist:         0.5,
  // ── Newly protected features ─────────────────────────────────────────────────
  quickFix:         1,    // resume quick-fix suggestions (premium Sonnet)
  interviewEval:    0.5,  // evaluate a single interview answer (Haiku)
  jobManual:        1,    // manual job add + AI extraction + scoring
  jobExpand:        1,    // expand job pool with AI reranking
  resumeGenerate:   2,    // AI resume builder (full profile generation)
  followUpMessage:  0.5,  // AI follow-up / thank-you message generation
} as const

export type CreditFeature = keyof typeof CREDIT_COSTS

export const CREDIT_ALLOCATIONS: Record<string, number> = {
  free:     5,
  pro_lite: 40,
  pro_plus: 120,
  pro:      120,   // backward compat — old 'pro' rows get pro_plus allocation
}

export interface CreditBalance {
  totalCredits:     number
  usedCredits:      number
  remainingCredits: number
  resetDate:        string
  planType:         string
}

export function insufficientCreditsResponse(feature: CreditFeature, remaining: number) {
  return {
    requiresUpgrade: true,
    reason:          'INSUFFICIENT_CREDITS',
    error:           `Not enough credits for ${feature}. You have ${remaining} credits remaining (need ${CREDIT_COSTS[feature]}).`,
    creditsRemaining: remaining,
    creditCost:       CREDIT_COSTS[feature],
  }
}

export async function getCredits(userId: string, adminClient: SupabaseClient): Promise<CreditBalance> {
  const { data } = await adminClient
    .from('ai_credits')
    .select('total_credits, used_credits, remaining_credits, reset_date, plan_type')
    .eq('user_id', userId)
    .single()

  if (!data) return { totalCredits: 0, usedCredits: 0, remainingCredits: 0, resetDate: '', planType: 'free' }

  return {
    totalCredits:     Number(data.total_credits),
    usedCredits:      Number(data.used_credits),
    remainingCredits: Number(data.remaining_credits),
    resetDate:        data.reset_date as string,
    planType:         data.plan_type as string,
  }
}

// Ensures a credits row exists for this user; creates one on first call.
// ignoreDuplicates=true means: if row exists, do not overwrite — leave current balance.
// Billing webhooks use reset_user_credits() to update plan and reset monthly credits.
export async function ensureCredits(
  userId:      string,
  planType:    string,
  adminClient: SupabaseClient,
): Promise<CreditBalance> {
  const total    = CREDIT_ALLOCATIONS[planType] ?? CREDIT_ALLOCATIONS.free
  const resetDay = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  await adminClient
    .from('ai_credits')
    .upsert(
      {
        user_id:              userId,
        plan_type:            planType,
        total_credits:        total,
        used_credits:         0,
        reset_date:           resetDay,
        last_credit_reset_at: new Date().toISOString(),
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )

  return getCredits(userId, adminClient)
}

// ── checkCredits ──────────────────────────────────────────────────────────────
// planTier: actual plan_tier from profiles table ('free', 'pro_lite', 'pro_plus', 'pro').
// Falls back to isPro-derived value when planTier is not provided (legacy callers).
// Passing planTier ensures new-user credit rows are created with the correct allocation.

export async function checkCredits(
  userId:      string,
  feature:     CreditFeature,
  isPro:       boolean,
  adminClient: SupabaseClient,
  planTier?:   string,
): Promise<{ allowed: boolean; balance: CreditBalance; cost: number }> {
  const resolvedPlanType = planTier ?? (isPro ? 'pro' : 'free')
  const balance  = await ensureCredits(userId, resolvedPlanType, adminClient)
  const cost     = CREDIT_COSTS[feature]
  const allowed  = balance.remainingCredits >= cost

  console.log(
    `[credits] check | user=${userId} | feature=${feature} | cost=${cost}` +
    ` | remaining=${balance.remainingCredits} | plan=${resolvedPlanType} | allowed=${allowed}`
  )

  return { allowed, balance, cost }
}

// ── deductCredits ─────────────────────────────────────────────────────────────
// Atomically deducts credits via DB RPC. Returns updated balance, or null on failure.
// IMPORTANT: call this AFTER the AI action has succeeded to avoid charging for failures.

export async function deductCredits(
  userId:      string,
  feature:     CreditFeature,
  adminClient: SupabaseClient,
): Promise<CreditBalance | null> {
  const cost = CREDIT_COSTS[feature]

  const { data, error } = await adminClient.rpc('deduct_ai_credits', { p_user_id: userId, p_cost: cost })

  if (error) {
    console.error(`[credits] deduct RPC error | user=${userId} | feature=${feature}`, error)
    return null
  }

  const result = data as { success: boolean; remaining: number }

  if (!result.success) {
    console.warn(`[credits] deduct failed (race) | user=${userId} | feature=${feature} | cost=${cost} | remaining=${result.remaining}`)
    return null
  }

  const creditsAfter  = Number(result.remaining)
  const creditsBefore = creditsAfter + cost
  console.log(
    `[credits] deducted | user=${userId} | feature=${feature} | cost=${cost}` +
    ` | before=${creditsBefore} | after=${creditsAfter}`
  )

  // Fire-and-forget: update per-feature usage counter for the usage popup
  void (async () => {
    const { error: usageErr } = await adminClient.rpc('increment_feature_usage', {
      p_user_id: userId,
      p_feature: feature,
      p_credits: cost,
    })
    if (usageErr) console.error(`[credits] increment_feature_usage failed | user=${userId} | feature=${feature}`, usageErr)
  })()

  return getCredits(userId, adminClient)
}

// ── refundCredits ─────────────────────────────────────────────────────────────
// Reverses a prior deduction — use when an AI call fails AFTER credits were already taken.
// In the "check → AI → deduct" pattern this is typically not needed; it is provided
// for routes that pre-deduct (deduct → AI → refund-on-failure) if needed in future.

export async function refundCredits(
  userId:      string,
  feature:     CreditFeature,
  adminClient: SupabaseClient,
): Promise<void> {
  const cost = CREDIT_COSTS[feature]

  const { error } = await adminClient.rpc('refund_ai_credits', { p_user_id: userId, p_cost: cost })

  if (error) {
    console.error(`[credits] refund RPC error | user=${userId} | feature=${feature} | cost=${cost}`, error)
    return
  }

  console.log(`[credits] refunded | user=${userId} | feature=${feature} | cost=${cost}`)
}
