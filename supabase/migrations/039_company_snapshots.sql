-- Company snapshots cache.
-- Stores AI-generated company info keyed by job_id so the same snapshot
-- is reused across all users who view the same job listing.

CREATE TABLE IF NOT EXISTS public.company_snapshots (
  job_id     text        PRIMARY KEY,
  snapshot   jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_snapshots ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read cached snapshots
CREATE POLICY "company_snapshots_read"
  ON public.company_snapshots FOR SELECT
  TO authenticated
  USING (true);
