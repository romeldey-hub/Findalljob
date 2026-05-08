/**
 * Centralized AI model config.
 * Override via env vars to swap models without code changes.
 *
 *   LIGHT_MODEL=claude-haiku-4-5-20251001   # fast, cheap — bullets, headlines, interview Qs
 *   PREMIUM_MODEL=claude-sonnet-4-6          # capable  — optimization, reranking, parsing
 */
export const LIGHT_MODEL   = process.env.LIGHT_MODEL   ?? 'claude-haiku-4-5-20251001'
export const PREMIUM_MODEL = process.env.PREMIUM_MODEL ?? 'claude-sonnet-4-6'
