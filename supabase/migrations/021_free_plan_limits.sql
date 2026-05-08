-- Free-plan daily tracking for general optimization and resume-hash caching
alter table profiles
  add column if not exists optimize_free_daily_count  integer not null default 0,
  add column if not exists optimize_free_date         text    not null default '',
  add column if not exists last_analyzed_resume_hash  text    not null default '';
