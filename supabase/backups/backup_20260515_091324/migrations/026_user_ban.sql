-- User ban mechanism — allows admins to block abusive/spam accounts
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_banned     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at     timestamptz,
  ADD COLUMN IF NOT EXISTS banned_reason text;

-- Partial index — only indexes banned rows, keeps it near-zero cost for normal users
CREATE INDEX IF NOT EXISTS idx_profiles_banned ON profiles (is_banned) WHERE is_banned = true;
