'use client'

import { useEffect, useState } from 'react'
import { X, Crown, Zap } from 'lucide-react'
import { RazorpayPaymentWidget } from '@/components/RazorpayPaymentWidget'
import { usePricing } from '@/hooks/usePricing'

interface UpgradeModalProps {
  onClose: () => void
}

const PRO_BULLETS = [
  'Tailor your resume to every job in seconds',
  'Practice full mock interviews with AI coaching on every answer',
  'Rank higher and get shortlisted for more roles',
  'Focus only on jobs you\'re actually likely to get hired for',
]

export function UpgradeModal({ onClose }: UpgradeModalProps) {
  const region = usePricing()
  const [selectedPlan, setSelectedPlan] = useState<'pro_lite' | 'pro_plus'>('pro_lite')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm z-10 rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-5 shadow-2xl space-y-3">

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-300 hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="font-bold text-[13px] text-white">Unlock everything you need to get hired</p>
        </div>

        <p className="text-[11px] text-gray-400">Pricing adjusted for your location</p>

        {/* Plan picker */}
        <div className="grid grid-cols-2 gap-2">
          {(['proLite', 'proPlus'] as const).map((key) => {
            const plan = region.plans[key]
            const isSelected = selectedPlan === plan.planId
            return (
              <button
                key={plan.planId}
                onClick={() => setSelectedPlan(plan.planId as 'pro_lite' | 'pro_plus')}
                className={`relative rounded-xl p-3 text-left transition-all border ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                {plan.isPopular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9px] font-black whitespace-nowrap">
                    Popular
                  </span>
                )}
                <p className="font-bold text-[12px] text-white mb-0.5">{plan.label}</p>
                <p className="text-[18px] font-black text-white leading-none">{plan.displayPrice}<span className="text-[11px] font-normal text-gray-400">/mo</span></p>
                <div className="flex items-center gap-1 mt-1.5">
                  <Zap className="w-2.5 h-2.5 text-amber-400" />
                  <span className="text-[10px] text-amber-400 font-semibold">{plan.credits} AI credits</span>
                </div>
              </button>
            )
          })}
        </div>

        <ul className="space-y-1.5">
          {PRO_BULLETS.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[11px] text-gray-300">
              <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
              {f}
            </li>
          ))}
        </ul>

        <RazorpayPaymentWidget planId={selectedPlan} label="Start Getting Interview-Ready" />
        <p className="text-center text-[10px] text-gray-500 -mt-1">Cancel anytime · No commitment</p>
      </div>
    </div>
  )
}
