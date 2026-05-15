-- Add free preview tracking to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_used_free_preview boolean NOT NULL DEFAULT false;

-- Mark existing users who already used AI (ai_actions_used > 0) as having consumed their preview
UPDATE profiles SET has_used_free_preview = true WHERE ai_actions_used > 0;

-- Anti-abuse: stores SHA-256 hashes of emails that have used the free preview
-- Persists across delete-and-re-signup attempts
CREATE TABLE IF NOT EXISTS preview_email_hashes (
  email_hash text PRIMARY KEY,
  used_at    timestamptz NOT NULL DEFAULT now()
);
