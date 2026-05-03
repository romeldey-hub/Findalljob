'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'

declare global {
  interface Window {
    Razorpay: any
  }
}

interface RazorpayPaymentProps {
  isLoading?: boolean
  label?: string
}

export function RazorpayPaymentWidget({ isLoading = false, label = 'Upgrade to Pro' }: RazorpayPaymentProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleUpgrade = async () => {
    track.upgradeClick('payment_widget')
    try {
      setLoading(true)

      // Step 1: Create Razorpay order
      const orderResponse = await fetch('/api/razorpay/checkout', { method: 'POST' })
      if (!orderResponse.ok) {
        const errData = await orderResponse.json().catch(() => ({}))
        throw new Error(errData?.error ?? 'Failed to create order')
      }
      const orderData = await orderResponse.json()

      // Step 2: Open checkout (load script only if not already present)
      const openCheckout = () => {
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          order_id: orderData.orderId,
          name: 'FindAllJob Pro',
          description: 'Pro Plan Subscription',
          image: '/logo-icon.svg',
          handler: async (response: any) => {
            try {
              // Step 3: Verify payment
              const verifyResponse = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              })
              if (verifyResponse.ok) {
                toast.success('Payment successful! You now have Pro access.')
                router.refresh()
                router.push('/matches')
              } else {
                const errData = await verifyResponse.json().catch(() => ({}))
                throw new Error(errData?.error ?? 'Payment verification failed')
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Payment verification failed'
              console.error('Payment verification error:', msg)
              toast.error(msg)
            }
          },
          modal: {
            ondismiss: () => {
              setLoading(false)
              toast.info('Payment cancelled.')
            },
          },
          prefill: { email: orderData.email, name: orderData.name },
          theme: { color: '#3B82F6' },
        }

        const rzp1 = new window.Razorpay(options)
        rzp1.on('payment.failed', (response: any) => {
          console.error('Payment failed:', response.error)
          toast.error(response.error?.description ?? 'Payment failed. Please try again.')
          setLoading(false)
        })
        rzp1.open()
      }

      if (window.Razorpay) {
        // Script already loaded from a previous checkout attempt
        openCheckout()
      } else {
        const script = document.createElement('script')
        script.src = 'https://checkout.razorpay.com/v1/checkout.js'
        script.async = true
        script.onload = openCheckout
        script.onerror = () => {
          toast.error('Could not load payment gateway. Check your connection and try again.')
          setLoading(false)
        }
        document.body.appendChild(script)
      }
    } catch (error) {
      console.error('Payment error:', error)
      toast.error('Failed to initiate payment. Please try again.')
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleUpgrade}
      disabled={loading || isLoading}
      className="w-full bg-amber-500 hover:bg-amber-600 text-white"
    >
      {loading ? 'Processing...' : label}
    </Button>
  )
}
