-- ─────────────────────────────────────────────────────────────────────────────
-- 028_credits_cron.sql
--
-- Backup monthly credit reset via pg_cron.
-- Runs daily at 02:00 UTC and resets any user whose reset_date has passed.
-- Idempotent: only touches rows where reset_date <= current_date AND
--             the user has actually consumed credits (used_credits > 0).
--             Users whose credits were already reset (used_credits = 0) are
--             skipped entirely to avoid unnecessary writes.
--
-- PREREQUISITE: pg_cron must be enabled in your Supabase project.
--   Dashboard → Database → Extensions → search "pg_cron" → Enable
--
-- To verify after applying:
--   SELECT * FROM cron.job WHERE jobname = 'monthly-credit-reset';
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable the extension (safe to run if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing job if present so this migration is re-runnable
SELECT cron.unschedule('monthly-credit-reset') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'monthly-credit-reset'
);

-- Schedule daily check at 02:00 UTC
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
      AND used_credits > 0;
  $$
);
