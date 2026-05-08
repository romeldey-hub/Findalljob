// Anthropic token pricing (USD per token)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80 / 1_000_000, output: 4.00 / 1_000_000 },
  'claude-sonnet-4-6':         { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
}

export function calcCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model]
  if (!p) return 0
  return +(inputTokens * p.input + outputTokens * p.output).toFixed(8)
}
