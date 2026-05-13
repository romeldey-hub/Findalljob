-- Rebuild company_snapshots as a domain-keyed table.
-- The prior table (039) was keyed by job_id; this schema lets every job
-- from the same company share one cached snapshot.

DROP TABLE IF EXISTS public.company_snapshots CASCADE;

CREATE TABLE public.company_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  text        NOT NULL,
  domain        text        UNIQUE,           -- e.g. "weka.io"  (null when unknown)
  website_url   text,                         -- e.g. "https://weka.io"
  overview      text,
  industry      text,
  location      text,
  company_size  text,
  source_urls   text[]      NOT NULL DEFAULT '{}',
  snapshot_data jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_snapshots_domain
  ON public.company_snapshots (domain)
  WHERE domain IS NOT NULL;

-- Maps a specific job listing to its cached company snapshot.
-- Lets the API skip the domain-lookup step on repeat views of the same job.
CREATE TABLE public.job_company_snapshots (
  job_id       text  PRIMARY KEY,
  snapshot_id  uuid  NOT NULL REFERENCES public.company_snapshots (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_company_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_snapshots_read"
  ON public.company_snapshots FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "job_company_snapshots_read"
  ON public.job_company_snapshots FOR SELECT
  TO authenticated USING (true);
