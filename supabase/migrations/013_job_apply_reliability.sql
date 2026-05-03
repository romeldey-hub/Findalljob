-- ── 013: Job apply reliability ───────────────────────────────────────────────
-- Adds dedicated apply_url, validation status, and expands allowed sources.

-- 1. New columns
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS apply_url       text,
  ADD COLUMN IF NOT EXISTS apply_status    text DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

-- 2. Backfill apply_url from existing url values
UPDATE jobs SET apply_url = url WHERE apply_url IS NULL;

-- 3. apply_status constraint
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_apply_status_check;
ALTER TABLE jobs
  ADD CONSTRAINT jobs_apply_status_check
    CHECK (apply_status IN ('active', 'broken', 'unverified'));

-- 4. Drop old narrow source constraint, add expanded version
--    The inline CHECK is auto-named; find it dynamically.
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT con.conname INTO c_name
  FROM   pg_constraint con
  JOIN   pg_class cls ON cls.oid = con.conrelid
  WHERE  cls.relname = 'jobs'
    AND  con.contype = 'c'
    AND  con.conname LIKE '%source%';
  IF c_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE jobs DROP CONSTRAINT ' || quote_ident(c_name);
  END IF;
END $$;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_source_check CHECK (
    source IN (
      -- Tier 1: ATS / direct company
      'greenhouse', 'lever', 'workable',
      -- Tier 2: Apify platform sources
      'apify_indeed', 'apify_linkedin', 'apify_naukri', 'apify_apna',
      -- Legacy / generic apify
      'apify',
      -- Tier 3: Aggregators
      'adzuna', 'jsearch',
      -- Manual entry
      'manual'
    )
  );

-- 5. Performance indexes
CREATE INDEX IF NOT EXISTS idx_jobs_apply_status   ON jobs(apply_status);
CREATE INDEX IF NOT EXISTS idx_jobs_last_verified  ON jobs(last_verified_at);
CREATE INDEX IF NOT EXISTS idx_jobs_source         ON jobs(source);
