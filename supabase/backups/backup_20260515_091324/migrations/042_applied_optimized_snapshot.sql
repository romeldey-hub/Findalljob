-- Store the optimized resume snapshot permanently on the applied job record.
-- This makes it survive resume deletion (optimized_resumes CASCADE-deletes when
-- resumes(id) is deleted) and old-run cleanup (job_matches gets purged by cron).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS optimized_snapshot jsonb;
