-- Free-plan usage tracking
-- resume_upload_count: incremented each time a resume file is successfully saved
-- ai_reanalyze_count:  incremented each time /api/resume/analyze completes successfully
alter table profiles
  add column if not exists resume_upload_count integer not null default 0,
  add column if not exists ai_reanalyze_count  integer not null default 0;
