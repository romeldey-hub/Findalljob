-- ─────────────────────────────────────────────────────────────────────────────
-- 033_search_run_cleanup_cron.sql
--
-- Periodic cleanup of job_search_runs and orphaned job_matches.
-- Runs nightly at 03:00 UTC via pg_cron.
--
-- What it deletes (in order, to satisfy FK constraints):
--
--   1. Matches belonging to failed runs older than 30 days.
--   2. Failed job_search_runs older than 30 days.
--   3. Old successful runs per user — keeps only the latest 3 per user,
--      deletes the rest along with their matches.
--   4. Orphaned job_matches (search_run_id IS NULL, older than 60 days).
--      These are pre-migration rows that were never backfilled, or any
--      legacy inserts from before migration 030.
--
-- Nothing touches the most-recent successful run per user.
-- Free users and pro users are treated identically.
--
-- PREREQUISITE: pg_cron must be enabled (see migration 028).
--
-- To verify after applying:
--   SELECT * FROM cron.job WHERE jobname = 'search-run-cleanup';
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('search-run-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'search-run-cleanup');

SELECT cron.schedule(
  'search-run-cleanup',
  '0 3 * * *',
  $$
    -- 1. Matches belonging to failed runs older than 30 days
    DELETE FROM job_matches
    WHERE search_run_id IN (
      SELECT id FROM job_search_runs
      WHERE status = 'failed'
        AND created_at < now() - INTERVAL '30 days'
    );

    -- 2. Failed runs older than 30 days (matches already removed above)
    DELETE FROM job_search_runs
    WHERE status = 'failed'
      AND created_at < now() - INTERVAL '30 days';

    -- 3. Old successful runs — keep only the latest 3 per user
    --    Step 3a: identify runs to delete (not in the top-3 per user)
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
      FROM job_search_runs
      WHERE status = 'success'
    ),
    to_delete AS (SELECT id FROM ranked WHERE rn > 3)
    -- Step 3b: delete their matches first
    DELETE FROM job_matches
    WHERE search_run_id IN (SELECT id FROM to_delete);

    -- Step 3c: delete the runs themselves
    DELETE FROM job_search_runs
    WHERE status = 'success'
      AND id NOT IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
          FROM job_search_runs
          WHERE status = 'success'
        ) ranked
        WHERE rn <= 3
      );

    -- 4. Orphaned matches (NULL search_run_id, older than 60 days)
    DELETE FROM job_matches
    WHERE search_run_id IS NULL
      AND created_at < now() - INTERVAL '60 days';
  $$
);
