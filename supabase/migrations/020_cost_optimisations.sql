-- Cost optimisation: per-user monthly quota for job-specific resume optimisation
-- and daily quota for AI bullet assist
alter table profiles
  add column if not exists job_optimize_month_count integer not null default 0,
  add column if not exists job_optimize_month       text    not null default '',
  add column if not exists ai_assist_daily_count    integer not null default 0,
  add column if not exists ai_assist_date           text    not null default '';
