'use client'

import { useState } from 'react'
import { Crown, CheckCircle2, Zap } from 'lucide-react'
import { RazorpayPaymentWidget } from '@/components/RazorpayPaymentWidget'
import { BillingModal } from '@/components/settings/BillingModal'

interface SubscriptionCardProps {
  isPro: boolean
  proUntil?: string | null
  cancelAtPeriodEnd?: boolean
}

const FREE_FEATURES = [
  'Resume upload & management',
  'Job search & matching',
  'Application tracking',
  'Save & organize jobs',
]

export function SubscriptionCard({ isPro, proUntil, cancelAtPeriodEnd = false }: SubscriptionCardProps) {
  const [showBilling, setShowBilling] = useState(false)

  return (
    <>
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5 sticky top-6 space-y-5">

      {/* ── Title ───────────────────────────────────────────────── */}
      <div>
        <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Subscription</h2>
        <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">Your current plan and access</p>
      </div>

      {/* ── Plan badge ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPro ? 'bg-amber-50 dark:bg-amber-950' : 'bg-[#F8FAFC] dark:bg-[#263549]'}`}>
            <Crown className={`w-4 h-4 ${isPro ? 'text-amber-500' : 'text-gray-400 dark:text-slate-500'}`} />
          </div>
          <div>
            <p className="font-bold text-[13px] text-[#0F172A] dark:text-[#F1F5F9]">{isPro ? 'Pro Plan' : 'Free Plan'}</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500">
              {isPro ? 'Unlimited access' : 'Access all job search and tracking features'}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950 border border-green-100 dark:border-green-900 text-[11px] font-bold text-green-700 dark:text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Active
        </span>
      </div>

      {/* ── Feature list ────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-slate-500 mb-2.5">
          {isPro ? 'Included' : 'Current Plan'}
        </p>
        <ul className="space-y-2">
          {FREE_FEATURES.map((feat) => (
            <li key={feat} className="flex items-start gap-2 text-[12px] text-gray-600 dark:text-slate-400">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-green-500" />
              {feat}
            </li>
          ))}
        </ul>
      </div>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      {!isPro ? (
        <div className="pt-1">
          <div className="rounded-xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="font-bold text-[13px] text-white">Upgrade to Pro</p>
            </div>
            <p className="text-[22px] font-bold text-white leading-none">
              $5<span className="text-[13px] font-normal text-gray-400">/month</span>
            </p>
            <ul className="space-y-1.5">
              {[
                'Customize your resume for every job',
                'Increase your job match score instantly',
                'Get AI insights to improve your applications',
                'Discover more relevant job opportunities',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-[11px] text-gray-300">
                  <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <RazorpayPaymentWidget />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowBilling(true)}
          className="w-full py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:scale-[1.01] transition-all"
        >
          Manage Billing
        </button>
      )}

    </div>

    {showBilling && (
      <BillingModal
        onClose={() => setShowBilling(false)}
        proUntil={proUntil}
        cancelAtPeriodEnd={cancelAtPeriodEnd}
      />
    )}
    </>
  )
}
