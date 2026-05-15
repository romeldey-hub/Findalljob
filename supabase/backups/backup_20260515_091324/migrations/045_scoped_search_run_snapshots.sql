-- Scoped search run snapshots.
-- A successful resume job search is now represented by one immutable run whose
-- visible cards are stored in rank order.  /api/jobs/match can fetch the exact
-- selected scope without mixing older countries, international runs, or manual
-- search matches.

-- Some production/dev databases were manually patched and may be missing the
-- earlier run-tracking migration. Recreate the prerequisite objects here so this
-- reliability migration is safe to apply by itself.
CREATE TABLE IF NOT EXISTS job_search_runs (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_hash                 text        NOT NULL,
  detected_location           text,
  jobs_fetched_count          integer,
  jobs_after_country_filter   integer,
  jobs_after_relevance_filter integer,
  jobs_scored_count           integer,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  completed_at                timestamptz,
  status                      text        NOT NULL DEFAULT 'running',
  generated_queries           jsonb,
  sources_used                jsonb,
  failure_reason              text,
  CONSTRAINT chk_job_search_runs_status CHECK (status IN ('running', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_job_search_runs_lookup
  ON job_search_runs (user_id, resume_hash, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_search_runs_created_at
  ON job_search_runs (created_at);

ALTER TABLE job_search_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own search runs" ON job_search_runs;
CREATE POLICY "Users can view own search runs"
  ON job_search_runs FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS search_run_id uuid REFERENCES job_search_runs(id) ON DELETE SET NULL;

-- Scoped runs need the same job to be allowed in separate runs. Remove the old
-- global user/job uniqueness if this database missed migration 031.
ALTER TABLE job_matches
  DROP CONSTRAINT IF EXISTS job_matches_user_id_job_id_key;

CREATE INDEX IF NOT EXISTS idx_job_matches_search_run_id
  ON job_matches (search_run_id);

CREATE INDEX IF NOT EXISTS idx_job_matches_user_run
  ON job_matches (user_id, search_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_matches_run_job
  ON job_matches (search_run_id, job_id)
  WHERE search_run_id IS NOT NULL;

ALTER TABLE job_search_runs
  ADD COLUMN IF NOT EXISTS search_mode text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS country_name text,
  ADD COLUMN IF NOT EXISTS final_selected_count integer,
  ADD COLUMN IF NOT EXISTS final_saved_count integer,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS audit_counts jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE job_search_runs
SET
  search_mode = CASE
    WHEN detected_location = 'international_remote' THEN 'international_remote'
    WHEN detected_location IS NOT NULL THEN 'country'
    ELSE COALESCE(search_mode, 'country')
  END,
  country_name = CASE
    WHEN detected_location = 'international_remote' THEN NULL
    ELSE COALESCE(country_name, detected_location)
  END,
  country_code = CASE detected_location
    WHEN 'India' THEN 'in'
    WHEN 'United States' THEN 'us'
    WHEN 'United Kingdom' THEN 'gb'
    WHEN 'Canada' THEN 'ca'
    WHEN 'Australia' THEN 'au'
    WHEN 'Germany' THEN 'de'
    WHEN 'France' THEN 'fr'
    WHEN 'Netherlands' THEN 'nl'
    WHEN 'Singapore' THEN 'sg'
    WHEN 'UAE' THEN 'ae'
    WHEN 'United Arab Emirates' THEN 'ae'
    WHEN 'New Zealand' THEN 'nz'
    WHEN 'South Africa' THEN 'za'
    ELSE country_code
  END
WHERE search_mode IS NULL OR country_name IS NULL OR country_code IS NULL;

ALTER TABLE job_search_runs
  DROP CONSTRAINT IF EXISTS chk_job_search_runs_search_mode;

ALTER TABLE job_search_runs
  ADD CONSTRAINT chk_job_search_runs_search_mode
  CHECK (search_mode IS NULL OR search_mode IN ('country', 'international_remote'));

CREATE INDEX IF NOT EXISTS idx_job_search_runs_scope_lookup
  ON job_search_runs (user_id, resume_hash, search_mode, country_code, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_search_runs_latest_success
  ON job_search_runs (user_id, status, created_at DESC);

ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS rank_position integer,
  ADD COLUMN IF NOT EXISTS display_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_job_matches_run_rank
  ON job_matches (search_run_id, rank_position)
  WHERE search_run_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_matches_run_rank
  ON job_matches (search_run_id, rank_position)
  WHERE search_run_id IS NOT NULL AND rank_position IS NOT NULL;
