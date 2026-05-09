-- ── Migration 031: per-run uniqueness on job_matches ─────────────────────────
-- The old UNIQUE(user_id, job_id) constraint is incompatible with the
-- run-based storage model introduced in migration 030: the same user can now
-- legitimately have the same job in multiple runs (one per search).
--
-- Replace it with UNIQUE(search_run_id, job_id), which prevents the same job
-- from appearing twice inside a single run (e.g. fetched from two sources).
-- NULLs in search_run_id are treated as distinct by SQL, so pre-migration rows
-- with NULL search_run_id are unaffected.

-- Drop the old cross-run uniqueness constraint
ALTER TABLE job_matches
  DROP CONSTRAINT IF EXISTS job_matches_user_id_job_id_key;

-- Add per-run uniqueness — only enforced when search_run_id is NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_matches_run_job
  ON job_matches (search_run_id, job_id)
  WHERE search_run_id IS NOT NULL;
