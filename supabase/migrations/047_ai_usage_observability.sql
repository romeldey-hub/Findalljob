-- Unified AI usage observability and idempotency controls.
-- Extends the existing Claude-focused ai_usage_events table so OpenAI,
-- embeddings, search-backed features, cache hits, fallback metadata, and
-- credit context can be tracked without changing product behavior.

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS cached_input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(12,8),
  ADD COLUMN IF NOT EXISTS credits_charged numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_feature_key text,
  ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS cache_hit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS search_run_id uuid,
  ADD COLUMN IF NOT EXISTS resume_id uuid,
  ADD COLUMN IF NOT EXISTS job_id text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE ai_usage_events
SET estimated_cost_usd = cost_usd
WHERE estimated_cost_usd IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider_ts
  ON ai_usage_events (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_model_ts
  ON ai_usage_events (model_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_success_ts
  ON ai_usage_events (success, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_search_run
  ON ai_usage_events (search_run_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_company
  ON ai_usage_events (company_name, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_idempotency_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  feature     text NOT NULL,
  status      text NOT NULL DEFAULT 'running',
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

ALTER TABLE ai_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view AI idempotency keys" ON ai_idempotency_keys;
CREATE POLICY "Admins can view AI idempotency keys"
  ON ai_idempotency_keys FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_ai_idempotency_keys_user_feature
  ON ai_idempotency_keys (user_id, feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_idempotency_keys_expires
  ON ai_idempotency_keys (expires_at);
