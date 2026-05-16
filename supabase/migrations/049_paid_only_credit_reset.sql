-- ─────────────────────────────────────────────────────────────────────────────
-- 049_paid_only_credit_reset.sql
--
-- Tighten monthly credit reset so it only runs for users with an actively
-- paid subscription.
--
-- Problem migration 048 introduced: plan_type in ai_credits is set to
-- 'pro_lite'/'pro_plus' on payment but is NOT reset to 'free' when a
-- subscription expires naturally (pro_until passes without renewal).
-- This means the cron could reset credits for lapsed subscribers.
--
-- Fix: JOIN ai_credits with profiles and guard on pro_until > current_date,
-- which is the sole source of truth for active Pro access (matches isProUser).
--
-- Rules enforced:
--   • plan_type = 'free'  → never reset (one-time credits)
--   • plan_type = paid    → only reset when profiles.pro_until > current_date
--   • expired/cancelled   → pro_until <= current_date → excluded
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop existing cron job (registered by 028 and updated by 048)
SELECT cron.unschedule('monthly-credit-reset')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'monthly-credit-reset'
);

-- Reschedule with active-subscription guard
SELECT cron.schedule(
  'monthly-credit-reset',
  '0 2 * * *',
  $$
    UPDATE public.ai_credits
    SET
      used_credits         = 0,
      reset_date           = (current_date + INTERVAL '30 days')::date,
      last_credit_reset_at = now(),
      updated_at           = now()
    FROM public.profiles
    WHERE public.ai_credits.user_id  = public.profiles.user_id
      AND public.ai_credits.reset_date  <= current_date
      AND public.ai_credits.used_credits > 0
      AND public.ai_credits.plan_type   != 'free'
      AND public.profiles.pro_until IS NOT NULL
      AND public.profiles.pro_until::date > current_date;
  $$
);
