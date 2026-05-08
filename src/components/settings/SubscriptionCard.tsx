'use client'

import { useState } from 'react'
import { Crown, CheckCircle2, Zap } from 'lucide-react'
import { RazorpayPaymentWidget } from '@/components/RazorpayPaymentWidget'
import { BillingModal } from '@/components/settings/BillingModal'
import { usePricing } from '@/hooks/usePricing'
import type { PlanId } from '@/lib/pricing'

interface SubscriptionCardProps {
  isPro: boolean
  planTier?: string
  proUntil?: string | null
  cancelAtPeriodEnd?: boolean
}

const FREE_FEATURES = [
  'Resume upload & management',
  'Job search & matching',
  'Application tracking',
  'Save & organize jobs',
]

const PRO_FEATURES = [
  'Customize your resume for every job',
  'Practice mock interviews with AI feedback',
  'Get shortlisted with higher match scores',
  'Discover jobs you\'re actually likely to get',
]

export function SubscriptionCard({ isPro, planTier, proUntil, cancelAtPeriodEnd = false }: SubscriptionCardProps) {
  const [showBilling, setShowBilling] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'pro_lite' | 'pro_plus'>('pro_lite')
  const region = usePricing()

  // For Pro users: find their current plan pricing
  const currentPlanKey = planTier === 'pro_plus' ? 'proPlus' : 'proLite'
  const currentPlan = region.plans[currentPlanKey]

  return (
    <>
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5 sticky top-6 space-y-5">

      {/* Title */}
      <div>
        <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Subscription</h2>
        <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">Your current plan and access</p>
      </div>

      {/* Plan badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPro ? 'bg-amber-50 dark:bg-amber-950' : 'bg-[#F8FAFC] dark:bg-[#263549]'}`}>
            <Crown className={`w-4 h-4 ${isPro ? 'text-amber-500' : 'text-gray-400 dark:text-slate-500'}`} />
          </div>
          <div>
            <p className="font-bold text-[13px] text-[#0F172A] dark:text-[#F1F5F9]">
              {isPro ? (planTier === 'pro_plus' ? 'Pro Plus' : 'Pro Lite') : 'Free Plan'}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500">
              {isPro ? (currentPlan.displayFull + ' · ' + currentPlan.credits + ' AI credits/month') : 'Access all job search and tracking features'}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950 border border-green-100 dark:border-green-900 text-[11px] font-bold text-green-700 dark:text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Active
        </span>
      </div>

      {/* Feature list */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-slate-500 mb-2.5">
          {isPro ? 'Included' : 'Current Plan'}
        </p>
        <ul className="space-y-2">
          {(isPro ? PRO_FEATURES : FREE_FEATURES).map((feat) => (
            <li key={feat} className="flex items-start gap-2 text-[12px] text-gray-600 dark:text-slate-400">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-green-500" />
              {feat}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      {!isPro ? (
        <div className="pt-1">
          <div className="rounded-xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="font-bold text-[13px] text-white">Choose your plan</p>
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
                    <p className="text-[16px] font-black text-white leading-none">{plan.displayPrice}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">/month</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Zap className="w-2.5 h-2.5 text-amber-400" />
                      <span className="text-[10px] text-amber-400 font-semibold">{plan.credits} credits</span>
                    </div>
                  </button>
                )
              })}
            </div>

            <RazorpayPaymentWidget planId={selectedPlan} label="Start Getting Interview-Ready" />
            <p className="text-center text-[10px] text-gray-500 -mt-1">Cancel anytime · No commitment</p>
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
        planTier={planTier}
      />
    )}
    </>
  )
}
