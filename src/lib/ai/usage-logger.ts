import { createAdminClient } from '@/lib/supabase/server'
import { calcCostUsd } from './costs'
import { LIGHT_MODEL } from './models'

export interface UsageEvent {
  task: string
  model: string
  inputTokens: number
  outputTokens: number
  userId?: string
  isFreeUser?: boolean
}

/** Fire-and-forget: never awaited, never blocks a request. */
export function logAiEvent(evt: UsageEvent): void {
  try {
    const admin    = createAdminClient()
    const costUsd  = calcCostUsd(evt.model, evt.inputTokens, evt.outputTokens)
    const tier     = evt.model === LIGHT_MODEL ? 'light' : 'premium'
    void admin.from('ai_usage_events').insert({
      user_id:       evt.userId ?? null,
      feature:       evt.task,
      model_tier:    tier,
      model_name:    evt.model,
      input_tokens:  evt.inputTokens,
      output_tokens: evt.outputTokens,
      cost_usd:      costUsd,
      is_free_user:  evt.isFreeUser ?? false,
    })
  } catch (err) {
    console.error('[usage-logger] log failed:', err)
  }
}
