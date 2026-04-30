import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isProUser } from '@/lib/admin'
import { resolveAvatar } from '@/lib/avatar'
import { ProfileCard } from '@/components/settings/ProfileCard'
import { PasswordCard } from '@/components/settings/PasswordCard'
import { SubscriptionCard } from '@/components/settings/SubscriptionCard'
import { AppearanceCard } from '@/components/settings/AppearanceCard'
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()

  // Base columns guaranteed to exist from migration 001
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, email, subscription_status, ai_actions_used')
    .eq('user_id', user!.id)
    .single()

  // role (005), headline (007), is_headline_edited (009) — stable columns
  const { data: extRow } = await admin
    .from('profiles')
    .select('role, headline, is_headline_edited')
    .eq('user_id', user!.id)
    .single()

  // avatar_url (010) — fetched in isolation so a missing column never kills extRow
  const { data: avatarRow } = await admin
    .from('profiles')
    .select('avatar_url')
    .eq('user_id', user!.id)
    .single()

  const isPro     = isProUser(user?.email, extRow?.role, profile?.subscription_status)
  const headline  = extRow?.headline ?? (user?.user_metadata?.headline as string | undefined) ?? ''
  const avatarUrl = resolveAvatar(avatarRow, user)

  const identities   = user?.identities ?? []
  const isGoogleUser = identities.some(i => i.provider === 'google')
  const hasPassword  = identities.some(i => i.provider === 'email')

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2 leading-tight">
          Settings
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">
          Manage your account, security, and subscription.
        </p>
      </div>

      {/* ── Main layout: center + right ─────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-5 items-start">

        {/* Center: Profile + Password */}
        <div className="flex-1 min-w-0 space-y-5">

          <ProfileCard
            userId={user!.id}
            initialName={profile?.full_name ?? ''}
            email={user?.email ?? ''}
            initialHeadline={headline}
            initialIsHeadlineEdited={extRow?.is_headline_edited ?? false}
            initialAvatarUrl={avatarUrl}
          />

          <PasswordCard
            email={user?.email ?? ''}
            isGoogleUser={isGoogleUser}
            hasPassword={hasPassword}
          />

          <AppearanceCard />

          <DeleteAccountCard />

        </div>

        {/* Right: Subscription */}
        <div className="w-full xl:w-[300px] xl:flex-shrink-0">
          <SubscriptionCard isPro={isPro} />
        </div>

      </div>
    </div>
  )
}
