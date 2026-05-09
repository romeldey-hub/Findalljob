-- ── Migration 030: job_search_runs + search_run_id rollout ───────────────────
-- Adds run-level tracking for every AI job search so the matches API can
-- always return only the latest clean successful result set per user+resume.
-- Safe rollout: search_run_id is nullable; existing matches are backfilled
-- with a synthetic successful run before the API filter is applied.

-- 1. job_search_runs table
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
  CONSTRAINT chk_job_search_runs_status CHECK (status IN ('running', 'success', 'failed'))
);

-- Fast lookup: latest successful run for a given user+resume
CREATE INDEX IF NOT EXISTS idx_job_search_runs_lookup
  ON job_search_runs (user_id, resume_hash, status, created_at DESC);

-- For cleanup queries on old runs
CREATE INDEX IF NOT EXISTS idx_job_search_runs_created_at
  ON job_search_runs (created_at);

-- 2. Add nullable search_run_id to job_matches
ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS search_run_id uuid REFERENCES job_search_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_matches_search_run_id
  ON job_matches (search_run_id);

CREATE INDEX IF NOT EXISTS idx_job_matches_user_run
  ON job_matches (user_id, search_run_id);

-- 3. Backfill: create one synthetic successful run per user with existing matches
--    so existing users never lose their matches when the API filter goes live.
DO $$
DECLARE
  rec         RECORD;
  new_run_id  uuid;
  match_count integer;
  latest_at   timestamptz;
  resume_h    text;
BEGIN
  FOR rec IN
    SELECT DISTINCT user_id
    FROM job_matches
    WHERE search_run_id IS NULL
  LOOP
    -- Aggregate counts and latest timestamp for this user's existing matches
    SELECT COUNT(*), MAX(created_at)
    INTO match_count, latest_at
    FROM job_matches
    WHERE user_id = rec.user_id AND search_run_id IS NULL;

    -- Prefer the resume_hash already stored on the active resume (raw PDF hash as proxy)
    SELECT resume_hash
    INTO resume_h
    FROM resumes
    WHERE user_id = rec.user_id AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;

    resume_h := COALESCE(resume_h, 'legacy');

    -- Create a synthetic run that represents all pre-migration matches
    INSERT INTO job_search_runs (
      user_id, resume_hash, status, jobs_scored_count, created_at, completed_at
    ) VALUES (
      rec.user_id,
      resume_h,
      'success',
      match_count,
      COALESCE(latest_at, now()),
      COALESCE(latest_at, now())
    )
    RETURNING id INTO new_run_id;

    -- Tag all existing matches with the synthetic run
    UPDATE job_matches
    SET search_run_id = new_run_id
    WHERE user_id = rec.user_id AND search_run_id IS NULL;
  END LOOP;
END $$;

-- 4. RLS: users can only read their own runs
ALTER TABLE job_search_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search runs"
  ON job_search_runs FOR SELECT
  USING (auth.uid() = user_id);
