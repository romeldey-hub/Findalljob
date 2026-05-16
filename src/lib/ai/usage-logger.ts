import { createAdminClient } from '@/lib/supabase/server'
import { calcCostUsd } from './costs'
import { LIGHT_MODEL } from './models'

const emittedDailyWarnings = new Set<string>()

export interface UsageEvent {
  task: string
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  userId?: string
  userEmail?: string | null
  isFreeUser?: boolean
  provider?: 'anthropic' | 'openai' | 'embedding' | 'search' | string
  creditsCharged?: number
  creditFeatureKey?: string
  success?: boolean
  errorCode?: string | null
  cacheHit?: boolean
  fallbackUsed?: boolean
  fallbackReason?: string | null
  searchRunId?: string | null
  resumeId?: string | null
  jobId?: string | null
  companyName?: string | null
  metadata?: Record<string, unknown>
}

/** Fire-and-forget: never awaited, never blocks a request. */
export function logAiEvent(evt: UsageEvent): void {
  const admin   = createAdminClient()
  const costUsd = calcCostUsd(evt.model, evt.inputTokens, evt.outputTokens, evt.cachedInputTokens ?? 0)
  const tier    = evt.model === LIGHT_MODEL ? 'light' : evt.provider === 'embedding' ? 'light' : 'premium'
  void (async () => {
    const { error } = await admin.from('ai_usage_events').insert({
      user_id:             evt.userId ?? null,
      user_email:          evt.userEmail ?? null,
      feature:             evt.task,
      provider:            evt.provider ?? 'anthropic',
      model_tier:          tier,
      model_name:          evt.model,
      input_tokens:        evt.inputTokens,
      output_tokens:       evt.outputTokens,
      cached_input_tokens: evt.cachedInputTokens ?? 0,
      cost_usd:            costUsd,
      estimated_cost_usd:  costUsd,
      is_free_user:        evt.isFreeUser ?? false,
      credits_charged:     evt.creditsCharged ?? 0,
      credit_feature_key:  evt.creditFeatureKey ?? null,
      success:             evt.success ?? true,
      error_code:          evt.errorCode ?? null,
      cache_hit:           evt.cacheHit ?? false,
      fallback_used:       evt.fallbackUsed ?? false,
      fallback_reason:     evt.fallbackReason ?? null,
      search_run_id:       evt.searchRunId ?? null,
      resume_id:           evt.resumeId ?? null,
      job_id:              evt.jobId ?? null,
      company_name:        evt.companyName ?? null,
      metadata:            evt.metadata ?? {},
    })
    if (error) console.error(`[usage-logger] insert failed | task=${evt.task} | model=${evt.model}`, error)
    if (!error) await warnIfDailyCostThresholdCrossed(admin)
  })()
}

function envNumber(name: string) {
  const raw = process.env[name]
  if (!raw) return 0
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : 0
}

async function warnIfDailyCostThresholdCrossed(admin: ReturnType<typeof createAdminClient>) {
  const thresholds = {
    total: envNumber('AI_DAILY_COST_WARNING_USD'),
    openai: envNumber('OPENAI_DAILY_COST_WARNING_USD'),
    anthropic: envNumber('ANTHROPIC_DAILY_COST_WARNING_USD'),
    free: envNumber('FREE_USER_DAILY_AI_COST_WARNING_USD'),
  }
  if (!thresholds.total && !thresholds.openai && !thresholds.anthropic && !thresholds.free) return

  const day = new Date().toISOString().slice(0, 10)
  const since = `${day}T00:00:00.000Z`
  const { data, error } = await admin
    .from('ai_usage_events')
    .select('provider, estimated_cost_usd, cost_usd, is_free_user')
    .gte('created_at', since)

  if (error) {
    console.warn('[cost-guardrail] Could not check daily AI cost thresholds:', error.message)
    return
  }

  const totals = (data ?? []).reduce(
    (acc, row) => {
      const cost = Number(row.estimated_cost_usd ?? row.cost_usd ?? 0)
      acc.total += cost
      if (row.provider === 'openai' || row.provider === 'embedding') acc.openai += cost
      if (row.provider === 'anthropic') acc.anthropic += cost
      if (row.is_free_user) acc.free += cost
      return acc
    },
    { total: 0, openai: 0, anthropic: 0, free: 0 },
  )

  for (const [key, threshold] of Object.entries(thresholds)) {
    if (!threshold) continue
    const actual = totals[key as keyof typeof totals]
    const warningKey = `${day}:${key}:${threshold}`
    if (actual >= threshold && !emittedDailyWarnings.has(warningKey)) {
      emittedDailyWarnings.add(warningKey)
      console.warn('[cost-guardrail] Daily AI cost warning threshold crossed', {
        scope: key,
        threshold_usd: threshold,
        actual_usd: Number(actual.toFixed(6)),
        day,
      })
    }
  }
}
