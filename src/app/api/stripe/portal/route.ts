import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, razorpay_payment_id, razorpay_order_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.razorpay_payment_id) {
    return NextResponse.redirect(new URL('/settings', req.url))
  }

  // Redirect to subscription management page
  // In a real app, you'd build a custom subscription management UI
  return NextResponse.redirect(new URL('/settings', req.url))
}
