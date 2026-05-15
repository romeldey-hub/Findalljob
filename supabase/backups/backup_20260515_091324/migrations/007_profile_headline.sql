-- Move headline out of user_metadata and into the profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS headline text NOT NULL DEFAULT '';

-- Back-fill from auth.users user_metadata where available
UPDATE profiles p
SET headline = COALESCE(
  (SELECT raw_user_meta_data->>'headline' FROM auth.users WHERE id = p.user_id),
  ''
);
