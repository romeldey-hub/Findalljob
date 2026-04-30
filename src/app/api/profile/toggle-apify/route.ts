import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('allow_apify_scraping')
    .eq('user_id', user.id)
    .single()

  await supabase
    .from('profiles')
    .update({ allow_apify_scraping: !profile?.allow_apify_scraping })
    .eq('user_id', user.id)

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings`, 303)
}
