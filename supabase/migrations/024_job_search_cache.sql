-- Job search cache — stores fetched NormalizedJob[] per user + query hash for 3-hour reuse
CREATE TABLE IF NOT EXISTS job_search_cache (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_hash text        NOT NULL,
  job_data   jsonb       NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, query_hash)
);

CREATE INDEX IF NOT EXISTS idx_job_search_cache_lookup
  ON job_search_cache (user_id, query_hash, created_at DESC);

ALTER TABLE job_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own job search cache" ON job_search_cache
  FOR ALL USING (auth.uid() = user_id);
