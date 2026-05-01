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
}

export function RazorpayPaymentWidget({ isLoading = false }: RazorpayPaymentProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleUpgrade = async () => {
    track.upgradeClick('payment_widget')
    try {
      setLoading(true)

      // Step 1: Create Razorpay order
      const orderResponse = await fetch('/api/stripe/checkout', {
        method: 'POST',
      })

      if (!orderResponse.ok) {
        const errData = await orderResponse.json().catch(() => ({}))
        throw new Error(errData?.error ?? 'Failed to create order')
      }

      const orderData = await orderResponse.json()

      // Step 2: Load Razorpay script
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      document.body.appendChild(script)

      script.onload = () => {
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          order_id: orderData.orderId,
          name: 'FindAllJob Pro',
          description: 'Pro Plan Subscription',
          image: '/logo-icon.png',
          handler: async (response: any) => {
            try {
              // Step 3: Verify payment
              const verifyResponse = await fetch('/api/stripe/verify-payment', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              })

              if (verifyResponse.ok) {
                toast.success('Payment successful! You now have Pro access.')
                router.push('/settings?upgraded=true')
              } else {
                throw new Error('Payment verification failed')
              }
            } catch (error) {
              console.error('Payment verification error:', error)
              toast.error('Payment verification failed. Please contact support.')
            }
          },
          prefill: {
            email: orderData.email,
            name: orderData.name,
          },
          theme: {
            color: '#3B82F6',
          },
        }

        const rzp1 = new window.Razorpay(options)
        rzp1.open()
      }
    } catch (error) {
      console.error('Payment error:', error)
      toast.error('Failed to initiate payment. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleUpgrade}
      disabled={loading || isLoading}
      className="w-full bg-amber-500 hover:bg-amber-600 text-white"
    >
      {loading ? 'Processing...' : 'Upgrade to Pro'}
    </Button>
  )
}
