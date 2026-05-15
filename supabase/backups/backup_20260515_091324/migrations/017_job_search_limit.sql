-- Track manual "Search & filter jobs" usage per user
alter table profiles
  add column if not exists job_search_count integer not null default 0;
