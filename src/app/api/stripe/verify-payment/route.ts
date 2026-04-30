import { NextResponse, NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json()

  // Verify Razorpay signature before touching the DB
  const sign = razorpay_order_id + '|' + razorpay_payment_id
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(sign)
    .digest('hex')

  if (razorpay_signature !== expectedSignature) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    // Upgrade subscription — admin client bypasses RLS so this always commits
    const { error } = await admin
      .from('profiles')
      .update({
        subscription_status: 'pro',
        razorpay_payment_id,
        razorpay_order_id,
      })
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[verify-payment] error:', error)
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 })
  }
}
