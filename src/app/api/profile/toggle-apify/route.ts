import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
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

  return NextResponse.redirect(new URL('/settings', req.url), 303)
}
