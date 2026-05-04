-- ── 015: Allow free public job API sources ───────────────────────────────────
-- The jobs.source column is text, but production DBs that have migration 013
-- applied also have a CHECK constraint. Recreate it with the new adapters.

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_source_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_source_check CHECK (
    source IN (
      -- Tier 1: ATS / direct company
      'greenhouse', 'lever', 'workable',
      -- Tier 2: Apify platform sources
      'apify_indeed', 'apify_linkedin', 'apify_naukri', 'apify_apna', 'apify_upwork',
      -- Legacy / generic Apify
      'apify',
      -- Tier 3: Aggregators and public APIs
      'adzuna', 'jsearch', 'himalayas', 'jobicy', 'remoteok', 'arbeitnow', 'jobspy',
      -- Manual entry
      'manual'
    )
  );
