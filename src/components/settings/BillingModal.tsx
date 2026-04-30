'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  X, Crown, CreditCard, Zap, ShieldCheck,
  AlertTriangle, CheckCircle2, Loader2, Calendar,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BillingData {
  ai_actions_used: number
  ai_actions_reset_at: string
  razorpay_payment_id: string | null
  razorpay_order_id: string | null
  updated_at: string
}

interface BillingModalProps {
  onClose: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

function addDays(iso: string, days: number) {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function BillingModal({ onClose }: BillingModalProps) {
  const [data, setData]             = useState<BillingData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [step, setStep]             = useState<'main' | 'confirm' | 'cancelled'>('main')

  // Lock scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Fetch billing data
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const { data: profile } = await supabase
        .from('profiles')
        .select('ai_actions_used, ai_actions_reset_at, razorpay_payment_id, razorpay_order_id, updated_at')
        .eq('user_id', user.id)
        .single()
      setData(profile)
      setLoading(false)
    })
  }, [])

  const nextBilling  = data ? fmt(addDays(data.updated_at, 30)) : '—'
  const resetDate    = data ? fmt(data.ai_actions_reset_at) : '—'
  const upgradeDate  = data ? fmt(data.updated_at) : '—'
  const payRef       = data?.razorpay_payment_id
    ? `${data.razorpay_payment_id.slice(0, 14)}…`
    : null

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
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
            </div>
          ) : step === 'cancelled' ? (
            <CancelledState endDate={nextBilling} onResume={() => setStep('main')} />
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
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-[11px] font-bold whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Active
                  </span>
                </div>
                <div className="space-y-1.5 pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center gap-2 pt-3">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <p className="text-[12px] text-slate-400">
                      Renews automatically on{' '}
                      <span className="text-white font-medium">{nextBilling}</span>
                    </p>
                  </div>
                  <p className="text-[12px] text-blue-400/70 pl-[22px] italic">
                    You're using AI-powered features to improve your job applications
                  </p>
                </div>
              </div>

              {/* ── Payment method ────────────────────────────────────── */}
              <div className="bg-[#0A1628] border border-[#1E2D45] rounded-xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-4">
                  Payment Method
                </p>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-[#1A2A40] flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-4 h-4 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-white">Razorpay</p>
                    <p className="text-[11px] text-slate-500">
                      {payRef ? `Ref · ${payRef}` : 'No payment on file'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => toast.info('To update your payment method, please contact support@findalljob.com')}
                    className="flex-1 py-2 rounded-lg border border-[#1E2D45] text-[12px] font-semibold text-slate-300 hover:border-blue-500/30 hover:text-white hover:bg-blue-500/5 transition-all"
                  >
                    Update Payment
                  </button>
                  <button
                    onClick={() => toast.info('To add a new card, please contact support@findalljob.com')}
                    className="flex-1 py-2 rounded-lg border border-[#1E2D45] text-[12px] font-semibold text-slate-300 hover:border-blue-500/30 hover:text-white hover:bg-blue-500/5 transition-all"
                  >
                    Add New Card
                  </button>
                </div>
              </div>

              {/* ── Usage ─────────────────────────────────────────────── */}
              <div className="bg-[#0A1628] border border-[#1E2D45] rounded-xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-4">
                  Usage This Month
                </p>
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Zap className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <span className="text-[13px] text-slate-300">AI actions used</span>
                    </div>
                    <span className="text-[14px] font-bold text-white">
                      {data?.ai_actions_used ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] pl-[36px]">
                    <span className="text-slate-500">Resets on</span>
                    <span className="text-slate-400">{resetDate}</span>
                  </div>
                </div>
                <p className="text-[12px] text-slate-600 italic pt-3 border-t border-[#1E2D45]">
                  You're actively improving your job match quality using AI
                </p>
              </div>

              {/* ── Billing history ───────────────────────────────────── */}
              <div className="bg-[#0A1628] border border-[#1E2D45] rounded-xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-4">
                  Billing History
                </p>
                {payRef ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] text-white font-medium">{upgradeDate}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Pro Plan · Monthly</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[14px] font-bold text-white">$5.00</span>
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-[11px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        Paid
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-slate-500">No billing history yet.</p>
                )}
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
          onConfirm={() => setStep('cancelled')}
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
  onConfirm: () => void
}) {
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
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-bold hover:scale-[1.01] active:scale-100 transition-all"
          >
            Keep Pro
          </button>
          <button
            onClick={onConfirm}
            className="w-full py-2.5 rounded-xl border border-[#1E2D45] text-[13px] font-medium text-slate-400 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-all"
          >
            Cancel anyway
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cancelled state ───────────────────────────────────────────────────────────

function CancelledState({
  endDate,
  onResume,
}: {
  endDate: string
  onResume: () => void
}) {
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
              Your plan will end on{' '}
              <span className="text-white font-medium">{endDate}</span>.
              You'll keep full Pro access until then.
            </p>
          </div>
        </div>
      </div>

      <p className="text-[12px] text-slate-500 text-center leading-relaxed px-2">
        To complete the cancellation, email us at{' '}
        <a
          href="mailto:support@findalljob.com"
          className="text-blue-400 hover:underline"
        >
          support@findalljob.com
        </a>
        {' '}and we'll process it within 24 hours.
      </p>

      <button
        onClick={onResume}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-bold hover:scale-[1.01] active:scale-100 transition-all"
      >
        Resume Subscription
      </button>
    </div>
  )
}
