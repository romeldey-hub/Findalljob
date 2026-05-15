-- ── 014: Canonical key for cross-source deduplication ────────────────────────
-- canonical_key = md5(lower(company) | lower(title) | lower(city))
-- Lets us recognise the same job posted on Adzuna, Indeed, LinkedIn, etc.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS canonical_key text;

-- Backfill from existing data
UPDATE jobs
SET canonical_key = md5(
  lower(trim(coalesce(company,  ''))) || '|' ||
  lower(trim(coalesce(title,    ''))) || '|' ||
  lower(trim(split_part(coalesce(location, ''), ',', 1)))
)
WHERE canonical_key IS NULL;

-- Index for fast cross-source lookups; NOT unique — multiple sources may co-exist
CREATE INDEX IF NOT EXISTS idx_jobs_canonical_key ON jobs(canonical_key);
