-- Experimental OpenAI Search Engine V2.
-- Fully separate from the existing Anthropic-backed job_search_runs/job_matches flow.

CREATE TABLE IF NOT EXISTS openai_search_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id             uuid REFERENCES resumes(id) ON DELETE SET NULL,
  resume_hash           text NOT NULL,
  status                text NOT NULL DEFAULT 'running',
  user_plan             text NOT NULL DEFAULT 'free',
  target_count          integer NOT NULL DEFAULT 15,
  search_mode           text,
  country_code          text,
  country_name          text,
  candidate_profile     jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_fetch_counts   jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_count         integer NOT NULL DEFAULT 0,
  normalized_count      integer NOT NULL DEFAULT 0,
  deduped_count         integer NOT NULL DEFAULT 0,
  location_filtered_count integer NOT NULL DEFAULT 0,
  role_filtered_count   integer NOT NULL DEFAULT 0,
  scored_count          integer NOT NULL DEFAULT 0,
  saved_count           integer NOT NULL DEFAULT 0,
  failure_reason        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_openai_search_runs_status CHECK (status IN ('running', 'success', 'failed'))
);

CREATE TABLE IF NOT EXISTS openai_search_results (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_run_id         uuid NOT NULL REFERENCES openai_search_runs(id) ON DELETE CASCADE,
  source                text NOT NULL,
  external_id           text NOT NULL,
  rank_position         integer NOT NULL,
  final_score           integer NOT NULL DEFAULT 0,
  local_score           integer NOT NULL DEFAULT 0,
  match_label           text NOT NULL DEFAULT '',
  title                 text NOT NULL DEFAULT '',
  company               text NOT NULL DEFAULT '',
  location              text NOT NULL DEFAULT '',
  description           text NOT NULL DEFAULT '',
  url                   text NOT NULL DEFAULT '',
  apply_url             text,
  posted_at             timestamptz,
  salary                text,
  matched_skills        jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_skills        jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_reasons         jsonb NOT NULL DEFAULT '[]'::jsonb,
  concerns              jsonb NOT NULL DEFAULT '[]'::jsonb,
  resume_fix_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  job_snapshot          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS openai_search_diagnostics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_run_id   uuid REFERENCES openai_search_runs(id) ON DELETE CASCADE,
  stage           text NOT NULL,
  count_value     integer,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openai_search_runs_user_created
  ON openai_search_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_openai_search_runs_user_success
  ON openai_search_runs(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_openai_search_results_run_rank
  ON openai_search_results(search_run_id, rank_position);

CREATE UNIQUE INDEX IF NOT EXISTS uq_openai_search_results_run_rank
  ON openai_search_results(search_run_id, rank_position);

CREATE UNIQUE INDEX IF NOT EXISTS uq_openai_search_results_run_source_external
  ON openai_search_results(search_run_id, source, external_id);

CREATE INDEX IF NOT EXISTS idx_openai_search_diagnostics_run_created
  ON openai_search_diagnostics(search_run_id, created_at);

ALTER TABLE openai_search_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE openai_search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE openai_search_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own OpenAI search runs" ON openai_search_runs;
CREATE POLICY "Users can view own OpenAI search runs"
  ON openai_search_runs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own OpenAI search results" ON openai_search_results;
CREATE POLICY "Users can view own OpenAI search results"
  ON openai_search_results FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own OpenAI search diagnostics" ON openai_search_diagnostics;
CREATE POLICY "Users can view own OpenAI search diagnostics"
  ON openai_search_diagnostics FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_openai_search_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS openai_search_runs_updated_at ON openai_search_runs;
CREATE TRIGGER openai_search_runs_updated_at
  BEFORE UPDATE ON openai_search_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_openai_search_updated_at();
