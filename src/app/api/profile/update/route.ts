import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { full_name, headline } = await req.json()
  if (!full_name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error: nameError } = await admin
    .from('profiles')
    .update({ full_name: full_name.trim() })
    .eq('user_id', user.id)

  if (nameError) return NextResponse.json({ error: nameError.message }, { status: 500 })

  if (typeof headline === 'string') {
    await admin
      .from('profiles')
      .update({ headline: headline.trim(), is_headline_edited: true })
      .eq('user_id', user.id)
  }

  return NextResponse.json({ success: true })
}
