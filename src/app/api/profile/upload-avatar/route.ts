import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { avatar_url: dataUrl } = await req.json() as { avatar_url: string }
  if (!dataUrl?.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Invalid image data' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Primary: profiles.avatar_url (migration 010 — text column, no size limit)
  const { error: dbError } = await admin
    .from('profiles')
    .update({ avatar_url: dataUrl })
    .eq('user_id', user.id)

  if (dbError) {
    // Column not yet applied — fall back to user_metadata
    console.warn('[upload-avatar] profiles.avatar_url unavailable:', dbError.message)
    const existing = user.user_metadata ?? {}
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...existing, uploaded_avatar_url: dataUrl },
    })
    if (metaError) {
      return NextResponse.json({ error: metaError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ publicUrl: dataUrl })
}
