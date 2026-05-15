-- Add matched_skills and missing_skills to job_matches
ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS matched_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_skills  jsonb NOT NULL DEFAULT '[]'::jsonb;
