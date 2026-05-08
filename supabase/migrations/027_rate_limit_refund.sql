-- ─────────────────────────────────────────────────────────────────────────────
-- 027_rate_limit_refund.sql
--
-- Adds:
--   1. rate_limit_windows   — per-user per-endpoint sliding-window counter
--   2. rate_limit_increment — atomic check-and-increment (returns count + allowed)
--   3. refund_ai_credits    — reverses a credit deduction on AI call failure
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Rate-limit window table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  key        TEXT    NOT NULL,
  window_min BIGINT  NOT NULL,  -- floor(epoch / 60): one bucket per minute
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_min)
);

-- Service-role-only: no authenticated user should read or write this table
ALTER TABLE rate_limit_windows ENABLE ROW LEVEL SECURITY;
-- (No public policies — service role bypasses RLS)

CREATE INDEX IF NOT EXISTS idx_rate_limit_windows_min ON rate_limit_windows (window_min);

-- ── 2. Atomic rate-limit increment ───────────────────────────────────────────
-- Increments the current minute's counter for (key).
-- Cleans up windows older than 5 minutes on every call (cheap partial scan).
-- Returns: count  — requests in this minute AFTER this call
--          allowed — whether count <= p_limit

CREATE OR REPLACE FUNCTION rate_limit_increment(
  p_key   TEXT,
  p_limit INTEGER
) RETURNS TABLE(count INTEGER, allowed BOOLEAN)
  LANGUAGE plpgsql SECURITY DEFINER AS
$$
DECLARE
  v_window  BIGINT  := FLOOR(EXTRACT(EPOCH FROM now()) / 60);
  v_count   INTEGER;
BEGIN
  -- Prune stale windows (> 4 minutes old)
  DELETE FROM rate_limit_windows
  WHERE window_min < v_window - 4;

  INSERT INTO rate_limit_windows (key, window_min, count)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_min)
  DO UPDATE SET count = rate_limit_windows.count + 1
  RETURNING rate_limit_windows.count INTO v_count;

  RETURN QUERY SELECT v_count, (v_count <= p_limit);
END;
$$;

-- ── 3. Credit refund ──────────────────────────────────────────────────────────
-- Reverses a deduction (used when an AI call fails after credits were reserved).
-- Guards: authenticated callers may only refund their own account.
-- Service-role callers (auth.uid() IS NULL) are unrestricted for admin use.

CREATE OR REPLACE FUNCTION refund_ai_credits(
  p_user_id uuid,
  p_cost    numeric
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER AS
$$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized: can only refund own credits';
  END IF;

  UPDATE ai_credits
  SET
    used_credits = GREATEST(0, used_credits - p_cost),
    updated_at   = now()
  WHERE user_id = p_user_id;
END;
$$;
