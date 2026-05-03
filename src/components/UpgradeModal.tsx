'use client'

import { useEffect } from 'react'
import { X, Crown, Zap } from 'lucide-react'
import { RazorpayPaymentWidget } from '@/components/RazorpayPaymentWidget'

interface UpgradeModalProps {
  onClose: () => void
}

const PRO_BULLETS = [
  'Customize your resume for every job',
  'Practice mock interviews with AI feedback',
  'Get shortlisted with higher match scores',
  'Discover jobs you\'re actually likely to get',
]

export function UpgradeModal({ onClose }: UpgradeModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Card — exact upgrade block from SubscriptionCard */}
      <div className="relative w-full max-w-sm z-10 rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-5 shadow-2xl space-y-3">

        {/* Close */}
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

        <div>
          <p className="text-[22px] font-bold text-white leading-none">
            $5<span className="text-[13px] font-normal text-gray-400">/month</span>
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">One step closer to your next job</p>
        </div>

        <ul className="space-y-1.5">
          {PRO_BULLETS.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[11px] text-gray-300">
              <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
              {f}
            </li>
          ))}
        </ul>

        <RazorpayPaymentWidget label="Start Getting Interview-Ready" />
        <p className="text-center text-[10px] text-gray-500 -mt-1">Cancel anytime · No commitment</p>
      </div>
    </div>
  )
}
