import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// POST { action: 'cancel' }  → set cancel_at_period_end = true
// POST { action: 'resume' }  → set cancel_at_period_end = false
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const cancelAtPeriodEnd = body?.action !== 'resume'

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ cancel_at_period_end: cancelAtPeriodEnd })
    .eq('user_id', user.id)

  if (error) {
    console.error('[portal] update error:', error)
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 })
  }

  return NextResponse.json({ success: true, cancel_at_period_end: cancelAtPeriodEnd })
}
