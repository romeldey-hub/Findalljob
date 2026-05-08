import { NextResponse, NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import { CREDIT_ALLOCATIONS } from '@/lib/credits'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keySecret) {
    console.error('[verify-payment] RAZORPAY_KEY_SECRET is not set')
    return NextResponse.json({ error: 'Payment configuration error' }, { status: 503 })
  }

  // Verify Razorpay signature before touching the DB
  const sign = razorpay_order_id + '|' + razorpay_payment_id
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(sign)
    .digest('hex')

  if (razorpay_signature !== expectedSignature) {
    console.error('[verify-payment] signature mismatch', { razorpay_order_id, razorpay_payment_id })
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    // Read existing pro_until and pending_plan_tier to handle re-purchase before expiry:
    // new expiry = max(now, existing_pro_until) + 30 days
    const { data: existing } = await admin
      .from('profiles')
      .select('pro_until, pending_plan_tier')
      .eq('user_id', user.id)
      .single()

    const planTier = (existing?.pending_plan_tier as string | null) ?? 'pro_plus'

    const base =
      existing?.pro_until && new Date(existing.pro_until) > new Date()
        ? new Date(existing.pro_until)
        : new Date()
    const proUntil = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)

    const { error } = await admin
      .from('profiles')
      .update({
        subscription_status: 'pro',
        razorpay_payment_id,
        razorpay_order_id,
        pro_until: proUntil.toISOString(),
        cancel_at_period_end: false,
        plan_tier: planTier,
      })
      .eq('user_id', user.id)

    if (error) throw error

    const creditTotal = CREDIT_ALLOCATIONS[planTier] ?? 40
    void admin.rpc('reset_user_credits', {
      p_user_id: user.id,
      p_total:   creditTotal,
      p_plan:    planTier,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[verify-payment] error:', error)
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 })
  }
}
