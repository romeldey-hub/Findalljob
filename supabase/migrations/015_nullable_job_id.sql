-- Allow general-improvement optimized resumes (no linked job)
ALTER TABLE optimized_resumes ALTER COLUMN job_id DROP NOT NULL;
