-- Public profile: username slug + privacy settings
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username             text,
  ADD COLUMN IF NOT EXISTS profile_public       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_email           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_phone           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_resume_download boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_to_opportunities boolean DEFAULT true;

-- Case-insensitive unique index — only enforced when username is non-null/non-empty
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON profiles (lower(username))
  WHERE username IS NOT NULL AND username <> '';
