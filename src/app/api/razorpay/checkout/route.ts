import { NextRequest, NextResponse }        from 'next/server'
import Razorpay                             from 'razorpay'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getPricingByCountry }             from '@/lib/pricing'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Read keys inside the handler so they're always fresh (avoids stale module-level values)
  const keyId     = process.env.RAZORPAY_KEY_ID     ?? ''
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? ''

  // Guard: keys must look like real Razorpay keys (rzp_test_… or rzp_live_…)
  if (!keyId.startsWith('rzp_')) {
    return NextResponse.json(
      { error: 'Razorpay API keys are not configured. Add rzp_test_… keys to .env.local.' },
      { status: 503 }
    )
  }

  // Dynamic pricing based on user's country
  const body        = await request.json().catch(() => ({})) as { countryCode?: string }
  const pricing     = getPricingByCountry(body.countryCode)

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
  const admin    = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .single()

  try {
    const order = await razorpay.orders.create({
      amount:   pricing.amount,
      currency: pricing.currency,
      receipt:  `ord_${user.id.slice(0, 8)}_${Date.now().toString().slice(-8)}`,
      notes: {
        supabase_user_id: user.id,
        email:            user.email ?? '',
      },
    })

    // Store order ID for later signature verification — non-fatal if column missing
    const { error: saveErr } = await admin
      .from('profiles')
      .update({ razorpay_order_id: order.id })
      .eq('user_id', user.id)
    if (saveErr) console.warn('[checkout] could not save razorpay_order_id:', saveErr.message)

    return NextResponse.json({
      orderId:  order.id,
      keyId:    process.env.RAZORPAY_KEY_ID,
      amount:   order.amount,
      currency: order.currency,
      email:    user.email ?? '',
      name:     profile?.full_name || 'User',
    })
  } catch (error: unknown) {
    const rzpErr = error as { error?: { description?: string }; message?: string }
    const detail = rzpErr?.error?.description ?? rzpErr?.message ?? 'Unknown error'
    console.error('[checkout] Razorpay error:', detail)
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}
