// Token pricing (USD per token).
// Sources checked May 16, 2026:
// - Anthropic Claude pricing docs: Haiku 4.5 $1/$5 per MTok, Sonnet 4.6 $3/$15 per MTok.
// - OpenAI model docs: GPT-5.2 $1.75/$14 per MTok, text-embedding-3-small $0.02 per MTok.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1.00 / 1_000_000, output: 5.00 / 1_000_000 },
  'claude-sonnet-4-6':         { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  'gpt-5.2':                   { input: 1.75 / 1_000_000, output: 14.00 / 1_000_000 },
  'gpt-5.2-2025-12-11':        { input: 1.75 / 1_000_000, output: 14.00 / 1_000_000 },
  'text-embedding-3-small':    { input: 0.02 / 1_000_000, output: 0 },
}

export function calcCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  const p = MODEL_PRICING[model]
  if (!p) return 0
  const billableInput = Math.max(0, inputTokens - cachedInputTokens)
  const cachedRate = p.input * 0.1
  return +(billableInput * p.input + cachedInputTokens * cachedRate + outputTokens * p.output).toFixed(8)
}
