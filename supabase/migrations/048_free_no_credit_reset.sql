-- ─────────────────────────────────────────────────────────────────────────────
-- 048_free_no_credit_reset.sql
--
-- Option B: Free users receive 5 one-time AI credits at signup only.
-- Free credits must NOT reset monthly — only paid plan rows reset.
--
-- Change: reschedule the monthly-credit-reset cron job to exclude
-- rows where plan_type = 'free'.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove existing job so this migration is re-runnable
SELECT cron.unschedule('monthly-credit-reset')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'monthly-credit-reset'
);

-- Reschedule with free-user exclusion
SELECT cron.schedule(
  'monthly-credit-reset',
  '0 2 * * *',
  $$
    UPDATE ai_credits
    SET
      used_credits         = 0,
      reset_date           = (current_date + INTERVAL '30 days')::date,
      last_credit_reset_at = now(),
      updated_at           = now()
    WHERE reset_date <= current_date
      AND used_credits > 0
      AND plan_type != 'free';
  $$
);
