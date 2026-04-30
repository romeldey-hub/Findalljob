import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser, isProUser } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // Base query — guaranteed columns from migration 001
  const { data: base } = await adminClient
    .from('profiles')
    .select('subscription_status')
    .eq('user_id', user.id)
    .single()

  // Optional columns from later migrations — null-safe if columns don't exist yet
  const { data: ext } = await adminClient
    .from('profiles')
    .select('role, has_used_free_preview')
    .eq('user_id', user.id)
    .single()

  const isAdmin = isAdminUser(user.email, ext?.role)

  return NextResponse.json({
    plan: isProUser(user.email, ext?.role, base?.subscription_status) ? 'pro' : 'free',
    has_used_free_preview: isAdmin ? false : (ext?.has_used_free_preview ?? false),
  })
}
