import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { CREDIT_ALLOCATIONS } from '@/lib/credits'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('x-razorpay-signature')!

  try {
    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest('hex')

    if (signature !== expectedSignature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(body)
    const supabase = createAdminClient()

    switch (event.event) {
      case 'order.paid': {
        const payment = event.payload.payment.entity
        const order = event.payload.order.entity
        const userId = order.notes.supabase_user_id

        // Idempotency: skip if this payment_id was already applied
        const { data: current } = await supabase
          .from('profiles')
          .select('razorpay_payment_id, pro_until')
          .eq('user_id', userId)
          .single()

        if (current?.razorpay_payment_id === payment.id) {
          return NextResponse.json({ received: true, skipped: 'duplicate' })
        }

        // Compute pro_until: max(now, existing) + 30 days to handle re-purchases
        const base =
          current?.pro_until && new Date(current.pro_until) > new Date()
            ? new Date(current.pro_until)
            : new Date()
        const proUntil = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)

        const planTier = (order.notes?.plan_tier as string | null) ?? 'pro_lite'

        await supabase
          .from('profiles')
          .update({
            subscription_status: 'pro',
            razorpay_payment_id: payment.id,
            razorpay_order_id: order.id,
            pro_until: proUntil.toISOString(),
            cancel_at_period_end: false,
            plan_tier: planTier,
          })
          .eq('user_id', userId)

        const creditTotal = CREDIT_ALLOCATIONS[planTier] ?? 40
        const { error: creditsError } = await supabase.rpc('reset_user_credits', {
          p_user_id: userId,
          p_total:   creditTotal,
          p_plan:    planTier,
        })
        if (creditsError) {
          console.error('[webhook/razorpay] reset_user_credits failed | user=%s | plan=%s', userId, planTier, creditsError)
        }
        break
      }

      case 'order.failed': {
        const order = event.payload.order.entity
        const userId = order.notes.supabase_user_id

        await supabase
          .from('profiles')
          .update({
            subscription_status: 'free',
          })
          .eq('user_id', userId)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
