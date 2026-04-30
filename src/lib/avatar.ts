import type { User } from '@supabase/supabase-js'

interface ProfileWithAvatar {
  avatar_url?: string | null
}

/**
 * Single source of truth for avatar resolution.
 * Priority: DB uploaded photo → metadata uploaded photo (migration fallback) → Google OAuth photo → null
 */
export function resolveAvatar(
  profile: ProfileWithAvatar | null | undefined,
  user: User | null | undefined,
): string | null {
  return (
    profile?.avatar_url
    || (user?.user_metadata?.uploaded_avatar_url as string | undefined)
    || (user?.user_metadata?.avatar_url as string | undefined)
    || null
  )
}
