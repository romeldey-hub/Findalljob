-- ── Migration 035: reduce free plan allocation from 10 → 5 credits ───────────
-- Normalizes existing free users immediately.
-- Pro users (pro_lite / pro_plus / pro) are untouched.

UPDATE ai_credits
SET
  total_credits = 5,
  -- Cap used_credits so remaining never goes negative
  used_credits  = LEAST(used_credits, 5),
  updated_at    = now()
WHERE plan_type = 'free'
  AND total_credits = 10;
