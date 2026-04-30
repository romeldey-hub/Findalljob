-- ─── 008: Resume versioning + optimized resume architecture ────────────────────
--
-- ADDITIVE ONLY. No existing columns, policies, or indexes are changed.
--
-- Changes:
--   1. Enforce exactly one active base resume per user (unique partial index)
--   2. Add resume_hash to resumes for upload dedup detection
--   3. Add ats_score column to optimized_resumes for direct querying
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. One active base resume per user ────────────────────────────────────────
-- Partial unique index: only rows where is_active = true are indexed,
-- so a user can have many historical (inactive) resumes but never two active ones.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_resume_per_user
  ON resumes (user_id)
  WHERE is_active = true;

-- ── 2. Resume content hash (dedup / change detection) ─────────────────────────
-- SHA-256 of the raw file bytes, stored at upload time.
-- NULL for pre-existing rows — backfill is not required.
ALTER TABLE resumes
  ADD COLUMN IF NOT EXISTS resume_hash text;

-- Index for fast "has this user already uploaded this exact file?" lookup.
CREATE INDEX IF NOT EXISTS resumes_user_hash_idx
  ON resumes (user_id, resume_hash)
  WHERE resume_hash IS NOT NULL;

-- ── 3. Direct ats_score column on optimized_resumes ───────────────────────────
-- Previously the score was only accessible by parsing the optimized_text JSON blob.
-- Storing it as a native integer column enables ORDER BY, filtering, and analytics.
-- NULL for pre-existing rows — new saves will populate it going forward.
ALTER TABLE optimized_resumes
  ADD COLUMN IF NOT EXISTS ats_score integer;
