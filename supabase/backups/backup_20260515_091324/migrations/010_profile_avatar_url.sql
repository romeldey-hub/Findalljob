-- ─── 010: avatar_url on profiles ─────────────────────────────────────────────
--
-- Stores user-uploaded profile photos separately from auth.user_metadata so
-- Google-provided photos are never overwritten. Display priority: profiles.avatar_url
-- (uploaded) > user_metadata.avatar_url (Google) > initials fallback.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;
