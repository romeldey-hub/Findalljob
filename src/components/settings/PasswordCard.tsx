'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Shield, Eye, EyeOff, Loader2, X, KeyRound, Mail, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface PasswordCardProps {
  email: string
  isGoogleUser: boolean
  hasPassword: boolean
}

export function PasswordCard({ email, isGoogleUser, hasPassword }: PasswordCardProps) {
  const [open, setOpen] = useState(false)
  const isSetFlow = isGoogleUser && !hasPassword

  return (
    <>
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6">
        <div className="mb-5">
          <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Password &amp; Security</h2>
          <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">Keep your account secure.</p>
        </div>

        <div className="flex items-center justify-between py-3 border-t border-[#F1F5F9] dark:border-[#334155]">
          <div>
            <p className="text-[13px] font-semibold text-gray-600 dark:text-slate-300">Password</p>
            {isSetFlow
              ? <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">Not set — you sign in with Google</p>
              : <p className="text-[13px] text-gray-400 dark:text-slate-500 tracking-[0.2em] mt-0.5">••••••••••••</p>
            }
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-semibold text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 hover:scale-[1.02] active:scale-100 transition-all"
          >
            {isSetFlow
              ? <><KeyRound className="w-3.5 h-3.5" />Set Password</>
              : <><Shield className="w-3.5 h-3.5" />Change Password</>
            }
          </button>
        </div>
      </div>

      {open && isSetFlow  && <SetPasswordModal    email={email} onClose={() => setOpen(false)} />}
      {open && !isSetFlow && <ChangePasswordModal email={email} onClose={() => setOpen(false)} />}
    </>
  )
}

// ── Set Password (Google user, no password yet) ───────────────────────────────

type SetStep = 'verify' | 'set'

function SetPasswordModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [step,        setStep]        = useState<SetStep>('verify')
  const [sending,     setSending]     = useState(false)
  const [otp,         setOtp]         = useState('')
  const [next,        setNext]        = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [showNext,    setShowNext]    = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error,       setError]       = useState('')
  const [saving,      setSaving]      = useState(false)

  // Mask email for display: an***@gmail.com
  const maskedEmail = email.replace(/^(.{2})(.+?)(@.+)$/, (_, a, _b, c) => `${a}***${c}`)

  async function handleSendCode() {
    setSending(true)
    setError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.reauthenticate()
      if (error) { setError(error.message); return }
      setStep('set')
    } catch {
      setError('Failed to send verification code. Please try again.')
    } finally {
      setSending(false)
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!otp.trim())      { setError('Verification code is required'); return }
    if (next.length < 8)  { setError('Password must be at least 8 characters'); return }
    if (next !== confirm)  { setError('Passwords do not match'); return }

    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: next, nonce: otp.trim() })
      if (error) { setError(error.message); return }
      toast.success('Password set successfully')
      onClose()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title="Set Password"
        subtitle={
          step === 'verify'
            ? 'Verify your identity before setting a password.'
            : 'Enter the code we sent and choose a new password.'
        }
        onClose={onClose}
      />

      {step === 'verify' ? (
        /* ── Step 1: send OTP ─────────────────────────────────── */
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-[#F8FAFC] dark:bg-[#263549] border border-[#E5E7EB] dark:border-[#334155]">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                You signed in with Google
              </p>
              <p className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                We&apos;ll send a verification code to{' '}
                <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{maskedEmail}</span>{' '}
                to confirm it&apos;s you.
              </p>
            </div>
          </div>

          {error && <ErrorBox message={error} />}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sending}
              className="flex-1 py-2.5 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-semibold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending
                ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</>
                : <><ArrowRight className="w-4 h-4" />Send Verification Code</>
              }
            </button>
          </div>
        </div>
      ) : (
        /* ── Step 2: OTP + new password ───────────────────────── */
        <form onSubmit={handleSetPassword} className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
              Verification Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter the code from your email"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#263549] text-[13px] text-[#0F172A] dark:text-[#F1F5F9] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all placeholder-gray-300 dark:placeholder-slate-600 tracking-widest font-mono"
              autoComplete="one-time-code"
            />
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">
              Check your email at {maskedEmail}
            </p>
          </div>

          <PasswordField
            label="New Password"
            value={next}
            show={showNext}
            onChange={setNext}
            onToggleShow={() => setShowNext(v => !v)}
            hint="Minimum 8 characters"
          />
          <PasswordField
            label="Confirm Password"
            value={confirm}
            show={showConfirm}
            onChange={setConfirm}
            onToggleShow={() => setShowConfirm(v => !v)}
          />

          {error && <ErrorBox message={error} />}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => { setStep('verify'); setError('') }}
              className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-all"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-semibold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" />Setting…</>
                : 'Set Password'
              }
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ── Change Password (email user or Google + existing password) ────────────────

function ChangePasswordModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [current,     setCurrent]     = useState('')
  const [next,        setNext]        = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [error,       setError]       = useState('')
  const [saving,      setSaving]      = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext,    setShowNext]    = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!current || !next || !confirm) { setError('All fields are required'); return }
    if (next.length < 8)               { setError('New password must be at least 8 characters'); return }
    if (next !== confirm)              { setError('Passwords do not match'); return }

    setSaving(true)
    try {
      const supabase = createClient()

      // Verify current password via re-sign-in
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current })
      if (signInErr) { setError('Current password is incorrect'); return }

      const { error: updateErr } = await supabase.auth.updateUser({ password: next })
      if (updateErr) { setError(updateErr.message); return }

      toast.success('Password updated successfully')
      onClose()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title="Change Password"
        subtitle="Choose a strong password for your account."
        onClose={onClose}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label="Current Password"
          value={current}
          show={showCurrent}
          onChange={setCurrent}
          onToggleShow={() => setShowCurrent(v => !v)}
        />
        <PasswordField
          label="New Password"
          value={next}
          show={showNext}
          onChange={setNext}
          onToggleShow={() => setShowNext(v => !v)}
          hint="Minimum 8 characters"
        />
        <PasswordField
          label="Confirm New Password"
          value={confirm}
          show={showConfirm}
          onChange={setConfirm}
          onToggleShow={() => setShowConfirm(v => !v)}
        />

        {error && <ErrorBox message={error} />}

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-semibold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" />Updating…</>
              : 'Update Password'
            }
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-6 z-10">
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h3 className="font-bold text-[16px] text-[#0F172A] dark:text-[#F1F5F9]">{title}</h3>
        <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="text-[12px] text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg px-3.5 py-2.5">
      {message}
    </p>
  )
}

function PasswordField({
  label, value, show, onChange, onToggleShow, hint,
}: {
  label: string
  value: string
  show: boolean
  onChange: (v: string) => void
  onToggleShow: () => void
  hint?: string
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#263549] text-[13px] text-[#0F172A] dark:text-[#F1F5F9] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all placeholder-gray-300 dark:placeholder-slate-600"
          placeholder="••••••••"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}
