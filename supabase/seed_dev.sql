-- ─────────────────────────────────────────────────────────────────────────────
-- DEV SEED — apply pending migrations + seed test data
-- Run once in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Migration 003: notifications ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('resume', 'application', 'jobs', 'system')),
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  cta_label   text,
  cta_href    text,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='Users can manage own notifications') THEN
    CREATE POLICY "Users can manage own notifications" ON notifications FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id, is_read, created_at DESC);

-- ── Migrations 016–021: profile columns ───────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS resume_upload_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_reanalyze_count         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_search_count           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS username                   text,
  ADD COLUMN IF NOT EXISTS profile_public             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_email                 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_phone                 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_resume_download       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_to_opportunities      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS linkedin_url               text,
  ADD COLUMN IF NOT EXISTS show_linkedin              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS x_url                     text,
  ADD COLUMN IF NOT EXISTS show_x                    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS facebook_url               text,
  ADD COLUMN IF NOT EXISTS show_facebook              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS job_optimize_month_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_optimize_month         text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_assist_daily_count      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_assist_date             text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS optimize_free_daily_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS optimize_free_date         text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_analyzed_resume_hash  text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS plan_tier                  text    NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS pending_plan_tier          text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON profiles (lower(username))
  WHERE username IS NOT NULL AND username <> '';

-- ── Migration 022: ai_credits table + RPC functions ───────────────────────────
CREATE TABLE IF NOT EXISTS ai_credits (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type            text        NOT NULL DEFAULT 'free',
  total_credits        numeric(10,2) NOT NULL DEFAULT 0,
  used_credits         numeric(10,2) NOT NULL DEFAULT 0,
  remaining_credits    numeric(10,2) GENERATED ALWAYS AS (total_credits - used_credits) STORED,
  reset_date           date        NOT NULL DEFAULT (current_date + interval '1 month')::date,
  last_credit_reset_at timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_credits_user_id_key UNIQUE (user_id)
);
ALTER TABLE ai_credits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_credits' AND policyname='Users can view own credits') THEN
    CREATE POLICY "Users can view own credits" ON ai_credits FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION deduct_ai_credits(p_user_id uuid, p_cost numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_remaining numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized: can only deduct own credits';
  END IF;
  UPDATE ai_credits
  SET used_credits = used_credits + p_cost, updated_at = now()
  WHERE user_id = p_user_id AND (total_credits - used_credits) >= p_cost
  RETURNING remaining_credits INTO v_remaining;
  IF found THEN RETURN jsonb_build_object('success', true, 'remaining', v_remaining); END IF;
  SELECT remaining_credits INTO v_remaining FROM ai_credits WHERE user_id = p_user_id;
  RETURN jsonb_build_object('success', false, 'remaining', coalesce(v_remaining, 0));
END; $$;

CREATE OR REPLACE FUNCTION reset_user_credits(p_user_id uuid, p_total numeric, p_plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden: reset_user_credits requires service role';
  END IF;
  INSERT INTO ai_credits (user_id, plan_type, total_credits, used_credits, reset_date, last_credit_reset_at)
  VALUES (p_user_id, p_plan, p_total, 0, (current_date + interval '1 month')::date, now())
  ON CONFLICT (user_id) DO UPDATE SET
    plan_type = excluded.plan_type, total_credits = excluded.total_credits,
    used_credits = 0, reset_date = excluded.reset_date,
    last_credit_reset_at = excluded.last_credit_reset_at, updated_at = now();
END; $$;

-- ── Migration 024: job_search_cache ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_search_cache (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_hash text        NOT NULL,
  job_data   jsonb       NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, query_hash)
);
CREATE INDEX IF NOT EXISTS idx_job_search_cache_lookup ON job_search_cache (user_id, query_hash, created_at DESC);
ALTER TABLE job_search_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='job_search_cache' AND policyname='Users can manage own job search cache') THEN
    CREATE POLICY "Users can manage own job search cache" ON job_search_cache FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── Migration 025: ai_usage_events ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  feature       text        NOT NULL,
  model_tier    text        NOT NULL CHECK (model_tier IN ('light','premium')),
  model_name    text        NOT NULL,
  input_tokens  integer     NOT NULL DEFAULT 0,
  output_tokens integer     NOT NULL DEFAULT 0,
  cost_usd      numeric(10,6) NOT NULL DEFAULT 0,
  is_free_user  boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_usage_events' AND policyname='Admin read') THEN
    CREATE POLICY "Admin read" ON ai_usage_events FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_ts      ON ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_ts ON ai_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_feat_ts ON ai_usage_events (feature, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: AI credits for anirban@bestin-e.com (user_id = 95712a3f-...)
-- Free plan: 10 total, 3 used → 7 remaining  (shows amber state in UI)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ai_credits (user_id, plan_type, total_credits, used_credits, reset_date)
VALUES (
  '95712a3f-3d86-405f-b4db-9c32232f1e15',
  'free',
  10,
  3,
  (current_date + interval '23 days')::date
)
ON CONFLICT (user_id) DO UPDATE SET
  plan_type    = 'free',
  total_credits = 10,
  used_credits  = 3,
  reset_date    = (current_date + interval '23 days')::date,
  updated_at    = now();

-- Verify
SELECT plan_type, total_credits, used_credits, remaining_credits, reset_date
FROM ai_credits
WHERE user_id = '95712a3f-3d86-405f-b4db-9c32232f1e15';
