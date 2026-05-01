'use client'

import { useState, useEffect } from 'react'
import {
  X, Crown, Zap, ShieldCheck, AlertTriangle,
} from 'lucide-react'

interface BillingModalProps {
  onClose: () => void
  proUntil?: string | null
  cancelAtPeriodEnd?: boolean
}

const VALUE_BULLETS = [
  'Customize your resume for every job',
  'Increase your job match score',
  'Get AI insights to improve applications',
]

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

export function BillingModal({ onClose, proUntil, cancelAtPeriodEnd = false }: BillingModalProps) {
  const [step, setStep] = useState<'main' | 'confirm' | 'cancelled'>(
    cancelAtPeriodEnd ? 'cancelled' : 'main'
  )

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleCancelConfirm = async () => {
    await fetch('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    setStep('cancelled')
  }

  const handleResume = async () => {
    await fetch('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume' }),
    })
    setStep('main')
  }

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
          {step === 'cancelled' ? (
            <CancelledState proUntil={proUntil} onResume={handleResume} />
          ) : (
            <>
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
                      {proUntil && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Active until {formatDate(proUntil)}
                        </p>
                      )}
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

              {/* ── Cancel ────────────────────────────────────────────── */}
              <div className="pt-1 pb-2">
                <button
                  onClick={() => setStep('confirm')}
                  className="w-full py-2.5 rounded-xl border border-red-500/15 text-[13px] font-semibold text-red-400/70 hover:border-red-500/35 hover:text-red-400 hover:bg-red-500/5 transition-all"
                >
                  Cancel Subscription
                </button>
              </div>
            </>
          )}
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

      {/* Cancel confirmation — layered on top */}
      {step === 'confirm' && (
        <CancelConfirmModal
          onKeep={() => setStep('main')}
          onConfirm={handleCancelConfirm}
        />
      )}
    </div>
  )
}

// ── Cancel confirmation sub-modal ─────────────────────────────────────────────

function CancelConfirmModal({
  onKeep,
  onConfirm,
}: {
  onKeep: () => void
  onConfirm: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onKeep} />
      <div className="relative w-full max-w-sm bg-[#0F1B2D] border border-[#1E2D45] rounded-2xl shadow-2xl z-10 p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/15 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
        </div>
        <h3 className="font-bold text-[17px] text-white text-center mb-2">
          Cancel your Pro plan?
        </h3>
        <p className="text-[13px] text-slate-400 text-center leading-relaxed mb-6">
          You'll lose access to resume optimization and AI insights that improve your job applications.
        </p>
        <div className="space-y-2.5">
          <button
            onClick={onKeep}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-bold hover:scale-[1.01] active:scale-100 transition-all disabled:opacity-50"
          >
            Keep Pro
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full py-2.5 rounded-xl border border-[#1E2D45] text-[13px] font-medium text-slate-400 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-all disabled:opacity-50"
          >
            {loading ? 'Cancelling…' : 'Cancel anyway'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cancelled state ───────────────────────────────────────────────────────────

function CancelledState({
  proUntil,
  onResume,
}: {
  proUntil?: string | null
  onResume: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  const handleResume = async () => {
    setLoading(true)
    await onResume()
    setLoading(false)
  }

  return (
    <div className="space-y-4 py-2">
      <div className="bg-[#1A0B0B] border border-red-500/20 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="font-bold text-[14px] text-white mb-1">Cancellation requested</p>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              You'll keep full Pro access{proUntil ? ` until ${formatDate(proUntil)}` : ' until your current billing period ends'}.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={handleResume}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-bold hover:scale-[1.01] active:scale-100 transition-all disabled:opacity-50"
      >
        {loading ? 'Resuming…' : 'Resume Subscription'}
      </button>
    </div>
  )
}
