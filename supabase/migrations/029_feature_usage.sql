-- ─────────────────────────────────────────────────────────────────────────────
-- 029_feature_usage.sql
--
-- Per-user, per-feature credit deduction counter.
-- Incremented atomically by the increment_feature_usage() RPC every time
-- deductCredits() succeeds. Used to power the "Your AI Usage" popup.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_feature_usage (
  user_id  uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature  text    NOT NULL,
  count    integer NOT NULL DEFAULT 0,
  credits  numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature)
);

-- Users may read their own rows; service role has full access (bypasses RLS)
ALTER TABLE ai_feature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_feature_usage"
  ON ai_feature_usage FOR SELECT
  USING (auth.uid() = user_id);

-- ── Atomic upsert ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_feature_usage(
  p_user_id uuid,
  p_feature text,
  p_credits numeric
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER AS
$$
BEGIN
  INSERT INTO ai_feature_usage (user_id, feature, count, credits)
  VALUES (p_user_id, p_feature, 1, p_credits)
  ON CONFLICT (user_id, feature)
  DO UPDATE SET
    count   = ai_feature_usage.count   + 1,
    credits = ai_feature_usage.credits + p_credits;
END;
$$;
