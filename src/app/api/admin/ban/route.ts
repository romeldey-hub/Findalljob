import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: selfProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!isAdminUser(user.email, selfProfile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { userId, ban, reason } = body as { userId?: string; ban?: boolean; reason?: string }

  if (!userId || typeof ban !== 'boolean') {
    return NextResponse.json({ error: 'userId and ban (boolean) are required' }, { status: 400 })
  }

  // Prevent admin from banning themselves
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot ban yourself' }, { status: 400 })
  }

  // Update profiles table
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      is_banned:     ban,
      banned_at:     ban ? new Date().toISOString() : null,
      banned_reason: ban ? (reason?.trim() || 'Spam / policy violation') : null,
    })
    .eq('user_id', userId)

  if (profileError) {
    console.error('[admin/ban] profile update error:', profileError.message)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // Supabase Auth-level ban: sets ban_duration which prevents new sign-ins
  try {
    if (ban) {
      await admin.auth.admin.updateUserById(userId, { ban_duration: '87600h' }) // ~10 years
    } else {
      await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
    }
  } catch (err) {
    // Non-fatal — profile-level ban still works via middleware
    console.warn('[admin/ban] auth ban failed (non-fatal):', err instanceof Error ? err.message : err)
  }

  console.log(`[admin/ban] user=${userId} ban=${ban} reason="${reason}" by admin=${user.id}`)
  return NextResponse.json({ success: true, ban })
}
