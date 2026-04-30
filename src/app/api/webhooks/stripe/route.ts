import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
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

        await supabase
          .from('profiles')
          .update({
            subscription_status: 'pro',
            razorpay_payment_id: payment.id,
            razorpay_order_id: order.id,
          })
          .eq('user_id', userId)
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
