-- Add social profile link columns to public profile settings
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS linkedin_url    TEXT,
  ADD COLUMN IF NOT EXISTS show_linkedin   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS x_url          TEXT,
  ADD COLUMN IF NOT EXISTS show_x         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS facebook_url   TEXT,
  ADD COLUMN IF NOT EXISTS show_facebook  BOOLEAN NOT NULL DEFAULT FALSE;
