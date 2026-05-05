import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/sonner'
import { LogoMark } from '@/components/LogoMark'
import { isAdminUser, isProUser } from '@/lib/admin'
import { resolveAvatar } from '@/lib/avatar'
import { resolveProUntil } from '@/lib/billing'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Use admin client so RLS never silently blocks this read.
  // Only select base-schema columns — optional columns (role, headline) added
  // by later migrations are fetched separately so a missing column can't
  // poison the entire query and blank out full_name.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, subscription_status')
    .eq('user_id', user.id)
    .single()

  // role (migration 005) — separate fetch so a missing column doesn't null-out profile above
  const { data: roleRow } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  // avatar_url (migration 010) — separate fetch for the same isolation reason
  const { data: avatarRow } = await admin
    .from('profiles')
    .select('avatar_url')
    .eq('user_id', user.id)
    .single()

  // pro_until (migration 012) — separate fetch for isolation
  const { data: billingRow } = await admin
    .from('profiles')
    .select('pro_until')
    .eq('user_id', user.id)
    .single()

  const effectiveProUntil = await resolveProUntil(
    admin, user.id, profile?.subscription_status, billingRow?.pro_until
  )
  const avatarUrl = resolveAvatar(avatarRow, user)

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] dark:bg-[#0B1120]">
      <Sidebar
        userName={profile?.full_name || user.email || 'User'}
        subscriptionStatus={isProUser(user.email, roleRow?.role, profile?.subscription_status, effectiveProUntil) ? 'pro' : 'free'}
        role={isAdminUser(user.email, roleRow?.role) ? 'admin' : 'user'}
        avatarUrl={avatarUrl}
      />
      <main className="flex-1 min-w-0 overflow-y-auto bg-[#F8FAFC] dark:bg-[#0B1120]">
        <div className="lg:hidden sticky top-0 z-30 border-b border-gray-100 dark:border-[#1E293B] bg-white/95 dark:bg-[#0F1B2D]/95 backdrop-blur-xl px-4 py-3">
          <LogoMark size="sm" />
        </div>
        <div className="p-4 sm:p-6 pb-24 lg:pb-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  )
}
