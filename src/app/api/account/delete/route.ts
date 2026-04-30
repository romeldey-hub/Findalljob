import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Delete all user data in parallel (CASCADE handles most relations,
  // but explicit deletes are safer and faster for large tables)
  await Promise.all([
    admin.from('optimized_resumes').delete().eq('user_id', user.id),
    admin.from('job_matches').delete().eq('user_id', user.id),
    admin.from('applications').delete().eq('user_id', user.id),
    admin.from('notifications').delete().eq('user_id', user.id),
  ])

  await admin.from('resumes').delete().eq('user_id', user.id)
  await admin.from('profiles').delete().eq('user_id', user.id)

  // Delete the auth user — this is the point of no return
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
