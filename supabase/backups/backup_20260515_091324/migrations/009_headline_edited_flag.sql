-- ─── 009: is_headline_edited flag on profiles ────────────────────────────────
--
-- Tracks whether the user has manually saved a headline, so the disclaimer
-- "Edited by you. This will be used across your profile." persists after refresh.
-- Defaults to false — existing rows (AI-generated or empty) are not affected.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_headline_edited boolean DEFAULT false;
