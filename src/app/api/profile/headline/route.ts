import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('headline')
    .eq('user_id', user.id)
    .single()

  console.log('[profile/headline] Fetched Headline:', data?.headline)
  return NextResponse.json({ headline: data?.headline ?? '' })
}
