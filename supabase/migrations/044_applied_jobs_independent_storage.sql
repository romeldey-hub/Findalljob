-- Independent Applied Jobs storage.
-- Applied Jobs is a persistent user-owned snapshot system, not a filtered view of
-- applications, job_matches, active resumes, search runs, or live job sources.

CREATE TABLE IF NOT EXISTS applied_jobs (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id             uuid REFERENCES applications(id) ON DELETE SET NULL,
  original_job_id            uuid,
  original_job_match_id      text,

  job_title                  text NOT NULL DEFAULT '',
  company_name               text NOT NULL DEFAULT '',
  company_logo_url           text,
  location                   text NOT NULL DEFAULT '',
  country                    text,
  remote_status              text,
  job_type                   text,
  experience_level           text,
  posted_at                  timestamptz,
  salary                     text,
  job_source                 text,
  original_job_url           text NOT NULL DEFAULT '',
  apply_url                  text,
  apply_status               text,
  verified_label             text NOT NULL DEFAULT 'unverified',

  match_score                integer NOT NULL DEFAULT 0,
  match_label                text NOT NULL DEFAULT '',
  ranking_text               text NOT NULL DEFAULT '',
  tags                       jsonb NOT NULL DEFAULT '[]'::jsonb,
  badges                     jsonb NOT NULL DEFAULT '[]'::jsonb,

  full_job_description       text NOT NULL DEFAULT '',
  why_this_matches           text NOT NULL DEFAULT '',
  match_reasons              jsonb NOT NULL DEFAULT '[]'::jsonb,
  skill_matches              jsonb NOT NULL DEFAULT '[]'::jsonb,
  skill_gaps                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  bridge_advice              text NOT NULL DEFAULT '',

  company_website            text,
  company_info               jsonb,

  optimized_resume_snapshot  jsonb,
  optimized_resume_score     integer,
  optimized_resume_view_data jsonb,
  optimized_resume_download_data jsonb,

  card_snapshot              jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_at                 timestamptz NOT NULL DEFAULT now(),
  removed_at                 timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applied_jobs_user_active
  ON applied_jobs(user_id, applied_at DESC)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_applied_jobs_user_job
  ON applied_jobs(user_id, original_job_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_applied_jobs_user_original_job
  ON applied_jobs(user_id, original_job_id)
  WHERE removed_at IS NULL AND original_job_id IS NOT NULL;

ALTER TABLE applied_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own applied jobs" ON applied_jobs;
CREATE POLICY "Users can manage own applied jobs"
  ON applied_jobs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS applied_jobs_updated_at ON applied_jobs;

-- Keep this migration portable across environments. The initial schema defines
-- update_updated_at(), but some databases may be missing it after partial/manual setup.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER applied_jobs_updated_at
  BEFORE UPDATE ON applied_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Backfill existing applied application snapshots into the independent table.
-- This is best-effort for legacy rows: if match_snapshot exists it preserves the
-- full card; otherwise it stores stable job metadata with score 0.
INSERT INTO applied_jobs (
  user_id,
  application_id,
  original_job_id,
  original_job_match_id,
  job_title,
  company_name,
  location,
  posted_at,
  salary,
  job_source,
  original_job_url,
  apply_url,
  apply_status,
  verified_label,
  match_score,
  match_label,
  ranking_text,
  full_job_description,
  why_this_matches,
  match_reasons,
  skill_matches,
  skill_gaps,
  bridge_advice,
  optimized_resume_snapshot,
  optimized_resume_score,
  optimized_resume_view_data,
  optimized_resume_download_data,
  card_snapshot,
  applied_at,
  removed_at,
  created_at,
  updated_at
)
SELECT
  a.user_id,
  a.id,
  a.job_id,
  a.match_snapshot->>'id',
  COALESCE(a.match_snapshot #>> '{job,title}', j.title, ''),
  COALESCE(a.match_snapshot #>> '{job,company}', j.company, ''),
  COALESCE(a.match_snapshot #>> '{job,location}', j.location, ''),
  COALESCE(NULLIF(a.match_snapshot #>> '{job,created_at}', '')::timestamptz, j.created_at),
  COALESCE(a.match_snapshot #>> '{job,salary}', j.salary),
  COALESCE(a.match_snapshot #>> '{job,source}', j.source),
  COALESCE(a.match_snapshot #>> '{job,url}', j.url, ''),
  COALESCE(a.match_snapshot #>> '{job,apply_url}', to_jsonb(j)->>'apply_url'),
  COALESCE(a.match_snapshot #>> '{job,apply_status}', to_jsonb(j)->>'apply_status'),
  COALESCE(a.match_snapshot #>> '{job,verified_label}', 'unverified'),
  CASE
    WHEN (a.match_snapshot->>'ai_score') ~ '^\d+$' THEN (a.match_snapshot->>'ai_score')::integer
    ELSE 0
  END,
  CASE
    WHEN CASE WHEN (a.match_snapshot->>'ai_score') ~ '^\d+$' THEN (a.match_snapshot->>'ai_score')::integer ELSE 0 END >= 80 THEN 'Strong Match'
    WHEN CASE WHEN (a.match_snapshot->>'ai_score') ~ '^\d+$' THEN (a.match_snapshot->>'ai_score')::integer ELSE 0 END >= 60 THEN 'Good Match'
    WHEN CASE WHEN (a.match_snapshot->>'ai_score') ~ '^\d+$' THEN (a.match_snapshot->>'ai_score')::integer ELSE 0 END >= 20 THEN 'Fair Match'
    ELSE 'Weak'
  END,
  CASE
    WHEN CASE WHEN (a.match_snapshot->>'ai_score') ~ '^\d+$' THEN (a.match_snapshot->>'ai_score')::integer ELSE 0 END >= 85 THEN 'Top 10%'
    WHEN CASE WHEN (a.match_snapshot->>'ai_score') ~ '^\d+$' THEN (a.match_snapshot->>'ai_score')::integer ELSE 0 END >= 75 THEN 'Top 20%'
    WHEN CASE WHEN (a.match_snapshot->>'ai_score') ~ '^\d+$' THEN (a.match_snapshot->>'ai_score')::integer ELSE 0 END >= 65 THEN 'Top 35%'
    ELSE 'Top 50%'
  END,
  COALESCE(a.match_snapshot #>> '{job,description}', j.description, ''),
  COALESCE(a.match_snapshot->>'ai_reasoning', ''),
  COALESCE(a.match_snapshot->'match_reasons', '[]'::jsonb),
  COALESCE(a.match_snapshot->'matched_skills', '[]'::jsonb),
  COALESCE(a.match_snapshot->'missing_skills', '[]'::jsonb),
  COALESCE(a.match_snapshot->>'bridge_advice', ''),
  a.optimized_snapshot,
  CASE
    WHEN jsonb_typeof(a.optimized_snapshot) = 'object'
      AND (a.optimized_snapshot->>'ats_score') ~ '^\d+$'
      THEN (a.optimized_snapshot->>'ats_score')::integer
    ELSE NULL
  END,
  a.optimized_snapshot,
  a.optimized_snapshot,
  COALESCE(a.match_snapshot, jsonb_build_object(
    'id', a.id::text,
    'ai_score', 0,
    'ai_reasoning', '',
    'bridge_advice', '',
    'match_reasons', '[]'::jsonb,
    'matched_skills', '[]'::jsonb,
    'missing_skills', '[]'::jsonb,
    'job', jsonb_build_object(
      'id', j.id::text,
      'title', COALESCE(j.title, ''),
      'company', COALESCE(j.company, ''),
      'location', COALESCE(j.location, ''),
      'url', COALESCE(j.url, ''),
      'apply_url', to_jsonb(j)->>'apply_url',
      'apply_status', to_jsonb(j)->>'apply_status',
      'verified_label', 'unverified',
      'salary', j.salary,
      'source', j.source,
      'description', COALESCE(j.description, ''),
      'created_at', j.created_at
    )
  )),
  COALESCE(a.applied_at, a.updated_at, a.created_at, now()),
  NULL,
  a.created_at,
  a.updated_at
FROM applications a
JOIN jobs j ON j.id = a.job_id
WHERE a.status = 'applied'
  AND NOT EXISTS (
    SELECT 1
    FROM applied_jobs aj
    WHERE aj.user_id = a.user_id
      AND aj.original_job_id = a.job_id
      AND aj.removed_at IS NULL
  );
