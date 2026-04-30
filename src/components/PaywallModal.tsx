'use client'

import { X, Crown, Wand2, Sparkles } from 'lucide-react'
import Link from 'next/link'

interface PaywallModalProps {
  onClose: () => void
  /** Called when the user dismisses without upgrading. Defaults to onClose. */
  onMaybeLater?: () => void
}

export function PaywallModal({ onClose, onMaybeLater }: PaywallModalProps) {
  const handleMaybeLater = onMaybeLater ?? onClose
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-6 z-10">

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="flex items-center justify-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/20 flex items-center justify-center">
            <Crown className="w-7 h-7 text-amber-500" />
          </div>
        </div>

        {/* Copy */}
        <div className="text-center mb-6">
          <h3 className="font-bold text-[18px] text-[#0F172A] dark:text-[#F1F5F9] mb-1.5">
            Unlock AI Resume Optimization
          </h3>
          <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
            You&apos;ve used your free preview. Upgrade to Pro for unlimited AI-tailored resumes that get you more interviews.
          </p>
        </div>

        {/* Feature bullets */}
        <div className="space-y-2.5 mb-6">
          {[
            { icon: Wand2,    text: 'Unlimited AI resume optimizations' },
            { icon: Sparkles, text: 'Keyword-matched rewrites per job description' },
            { icon: Crown,    text: 'ATS score improvements · Priority support' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-[13px] text-gray-600 dark:text-slate-400">
              <div className="w-6 h-6 rounded-lg bg-[#EFF6FF] dark:bg-[#1E3A5F] flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-[#2563EB]" />
              </div>
              {text}
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex gap-2.5">
          <button
            onClick={handleMaybeLater}
            className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-all"
          >
            Maybe Later
          </button>
          <Link href="/settings" className="flex-1">
            <button className="w-full py-2.5 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] hover:bg-[#1E293B] dark:hover:bg-blue-700 text-white text-[13px] font-bold transition-all flex items-center justify-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-400" />Upgrade to Pro
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
