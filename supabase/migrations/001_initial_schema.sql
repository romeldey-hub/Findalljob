-- Enable pgvector for job embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  location    text NOT NULL DEFAULT '',
  summary     text NOT NULL DEFAULT '',
  skills      jsonb NOT NULL DEFAULT '[]'::jsonb,
  allow_apify_scraping bool NOT NULL DEFAULT false,
  stripe_customer_id         text,
  stripe_subscription_id     text,
  subscription_status        text NOT NULL DEFAULT 'free',
  ai_actions_used            integer NOT NULL DEFAULT 0,
  ai_actions_reset_at        timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── Resumes ──────────────────────────────────────────────────────────────────
CREATE TABLE resumes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url     text NOT NULL,
  raw_text     text NOT NULL DEFAULT '',
  parsed_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  version      integer NOT NULL DEFAULT 1,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own resumes" ON resumes FOR ALL USING (auth.uid() = user_id);

-- ─── Jobs ─────────────────────────────────────────────────────────────────────
CREATE TABLE jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id  text NOT NULL,
  source       text NOT NULL,  -- adzuna | jsearch | apify | manual
  title        text NOT NULL DEFAULT '',
  company      text NOT NULL DEFAULT '',
  location     text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  url          text NOT NULL DEFAULT '',
  salary       text,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding    vector(1536),
  scraped_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(external_id, source)
);

CREATE INDEX jobs_embedding_idx ON jobs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Jobs are readable by all authenticated users (not user-specific)
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read jobs" ON jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage jobs" ON jobs FOR ALL TO service_role USING (true);

-- ─── Job Matches ──────────────────────────────────────────────────────────────
CREATE TABLE job_matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id            uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  similarity_score  float NOT NULL DEFAULT 0,
  ai_score          integer NOT NULL DEFAULT 0,
  ai_reasoning      text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id)
);

ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own matches" ON job_matches FOR ALL USING (auth.uid() = user_id);

-- ─── Optimized Resumes ────────────────────────────────────────────────────────
CREATE TABLE optimized_resumes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id           uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  base_resume_id   uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  optimized_text   text NOT NULL DEFAULT '',
  file_url         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE optimized_resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own optimized resumes" ON optimized_resumes FOR ALL USING (auth.uid() = user_id);

-- ─── Applications ─────────────────────────────────────────────────────────────
CREATE TABLE applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id               uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'saved',
  applied_at           timestamptz,
  apply_method         text,
  notes                text NOT NULL DEFAULT '',
  follow_up_messages   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id)
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own applications" ON applications FOR ALL USING (auth.uid() = user_id);

-- ─── Auto-create profile on signup ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE TRIGGER applications_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ─── pgvector similarity search function ──────────────────────────────────────
CREATE OR REPLACE FUNCTION match_jobs(
  query_embedding vector(1536),
  match_count      integer DEFAULT 30,
  min_score        float   DEFAULT 0.5
)
RETURNS TABLE (
  id               uuid,
  similarity       float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    1 - (embedding <=> query_embedding) AS similarity
  FROM jobs
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > min_score
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── Job data cleanup (runs daily via pg_cron or Supabase scheduled function) ──
-- Apify-sourced jobs expire after 7 days; API-sourced expire after 30 days
CREATE OR REPLACE FUNCTION cleanup_old_jobs()
RETURNS void AS $$
BEGIN
  DELETE FROM jobs
  WHERE (source = 'apify' AND scraped_at < now() - interval '7 days')
     OR (source IN ('adzuna', 'jsearch') AND scraped_at < now() - interval '30 days');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
