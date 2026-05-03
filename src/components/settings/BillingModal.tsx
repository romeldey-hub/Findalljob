'use client'

import { useState, useEffect } from 'react'
import { X, Crown, Zap, ShieldCheck } from 'lucide-react'

interface BillingModalProps {
  onClose: () => void
  proUntil?: string | null
  cancelAtPeriodEnd?: boolean
}

const VALUE_BULLETS = [
  'Customize your resume for every job',
  'Practice mock interviews with AI feedback',
  'Get shortlisted with higher match scores',
]

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

export function BillingModal({ onClose, proUntil, cancelAtPeriodEnd: initialCancelAtPeriodEnd = false }: BillingModalProps) {
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(initialCancelAtPeriodEnd)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleToggleAutoRenew = async () => {
    setLoading(true)
    await fetch('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: cancelAtPeriodEnd ? 'resume' : 'cancel' }),
    })
    setCancelAtPeriodEnd(!cancelAtPeriodEnd)
    setLoading(false)
  }

  const autoRenewOn = !cancelAtPeriodEnd
  const dateLabel = formatDate(proUntil)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-[480px] bg-[#0F1B2D] border border-[#1E2D45] rounded-2xl shadow-2xl z-10 flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2D45] flex-shrink-0">
          <h2 className="font-bold text-[15px] text-white">Billing &amp; Subscription</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/8 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* ── Current plan ──────────────────────────────────────── */}
          <div className="bg-gradient-to-br from-[#0D2244] to-[#0A1628] border border-blue-500/20 rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="font-bold text-[15px] text-white leading-tight">Pro Plan</p>
                  <p className="text-[13px] text-slate-400">$5 / month</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-[11px] font-bold whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Active
              </span>
            </div>

            {/* Value bullets */}
            <ul className="space-y-2 pt-3 border-t border-white/[0.06]">
              {VALUE_BULLETS.map((bullet) => (
                <li key={bullet} className="flex items-center gap-2 text-[12px] text-slate-300">
                  <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>

          {/* ── Auto-renew block ───────────────────────────────────── */}
          <div className={`rounded-xl border p-4 space-y-3 ${
            autoRenewOn
              ? 'bg-green-500/5 border-green-500/20'
              : 'bg-amber-500/5 border-amber-500/20'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${autoRenewOn ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
              <p className={`font-bold text-[13px] ${autoRenewOn ? 'text-green-400' : 'text-amber-400'}`}>
                Auto-renew: {autoRenewOn ? 'ON' : 'OFF'}
              </p>
            </div>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              {autoRenewOn
                ? `Auto-renew is enabled. You'll be billed again on ${dateLabel}.`
                : `Auto-renew is off. Your access continues until ${dateLabel}.`}
            </p>
            <button
              onClick={handleToggleAutoRenew}
              disabled={loading}
              className={`w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-50 ${
                autoRenewOn
                  ? 'border border-slate-600/40 text-slate-400 hover:border-slate-500 hover:text-slate-300 hover:bg-white/5'
                  : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-[1.01] active:scale-100'
              }`}
            >
              {loading
                ? (autoRenewOn ? 'Turning off…' : 'Resuming…')
                : (autoRenewOn ? 'Turn off auto-renew' : 'Resume subscription')}
            </button>
          </div>

        </div>

        {/* Trust footer */}
        <div className="flex-shrink-0 border-t border-[#1E2D45] px-6 py-3 flex items-center justify-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <ShieldCheck className="w-3 h-3" />
            Secure payments powered by Razorpay
          </div>
          <span className="text-slate-700 text-[10px]">·</span>
          <span className="text-[11px] text-slate-600">No hidden charges</span>
          <span className="text-slate-700 text-[10px]">·</span>
          <span className="text-[11px] text-slate-600">Cancel anytime</span>
        </div>
      </div>
    </div>
  )
}
