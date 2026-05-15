-- Per-call AI usage log: records every Claude API call with actual token counts and computed cost.
-- Used exclusively by the admin usage dashboard. Service-role inserts; admin-only reads.

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

-- Only admins can read; inserts come from service-role (bypasses RLS)
CREATE POLICY "Admin read" ON ai_usage_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_ts      ON ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_ts ON ai_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_feat_ts ON ai_usage_events (feature, created_at DESC);
