-- ── Migration 034: add full_name to ai_credits ───────────────────────────────
-- Captures the user's display name on the credits row so admin queries
-- show who owns each credit balance without needing a JOIN to profiles.
--
-- A trigger keeps full_name in sync whenever profiles.full_name changes.

-- 1. Add the column (nullable — backfilled by trigger below)
ALTER TABLE ai_credits
  ADD COLUMN IF NOT EXISTS full_name text;

-- 2. Backfill existing rows from profiles
UPDATE ai_credits ac
SET full_name = p.full_name
FROM profiles p
WHERE p.user_id = ac.user_id
  AND (ac.full_name IS NULL OR ac.full_name = '');

-- 3. Trigger function: sync full_name from profiles → ai_credits on every profile save
CREATE OR REPLACE FUNCTION sync_ai_credits_full_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ai_credits
  SET full_name = NEW.full_name
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- 4. Attach trigger to profiles (fires after INSERT or UPDATE of full_name)
DROP TRIGGER IF EXISTS trg_sync_ai_credits_full_name ON profiles;
CREATE TRIGGER trg_sync_ai_credits_full_name
  AFTER INSERT OR UPDATE OF full_name ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_ai_credits_full_name();
