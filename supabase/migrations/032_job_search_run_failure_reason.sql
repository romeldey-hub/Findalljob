-- ── Migration 032: failure_reason on job_search_runs ─────────────────────────
-- Distinguishes between different zero-result outcomes so debugging is easier:
--   no_jobs_found       — sources returned nothing after all filters
--   no_relevant_matches — jobs were fetched but none survived to be saved
--   (null)              — generic failure (exception, timeout, etc.)

ALTER TABLE job_search_runs
  ADD COLUMN IF NOT EXISTS failure_reason text;
