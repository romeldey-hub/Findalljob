-- ─────────────────────────────────────────────────────────────────────────────
-- 050_profile_auto_disabled_no_resume.sql
--
-- Adds a flag to track when the public profile was automatically disabled
-- because the user deleted their resume (not a manual user choice).
-- When the user uploads or creates a resume again, the system restores
-- profile_public = true only if this flag is set.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_auto_disabled_no_resume boolean NOT NULL DEFAULT false;
