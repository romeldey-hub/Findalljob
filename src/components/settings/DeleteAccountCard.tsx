'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const CONFIRM_PHRASE = 'DELETE'

export function DeleteAccountCard() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-red-100 dark:border-red-900/40 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <h2 className="font-bold text-[15px] text-red-600 dark:text-red-400">Danger Zone</h2>
        </div>
        <p className="text-[12px] text-gray-400 dark:text-slate-500 mb-5">
          Irreversible actions that affect your account permanently.
        </p>

        <div className="flex items-center justify-between py-3 border-t border-red-50 dark:border-red-900/30">
          <div>
            <p className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Delete Account</p>
            <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5 max-w-sm leading-relaxed">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-[12px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:scale-[1.02] active:scale-100 transition-all flex-shrink-0 ml-6"
          >
            <Trash2 className="w-3.5 h-3.5" />Delete Account
          </button>
        </div>
      </div>

      {open && <DeleteConfirmModal onClose={() => setOpen(false)} />}
    </>
  )
}

// ── Confirmation modal ────────────────────────────────────────────────────────

function DeleteConfirmModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [input,   setInput]   = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error,   setError]   = useState('')

  const confirmed = input === CONFIRM_PHRASE

  async function handleDelete() {
    if (!confirmed) return
    setDeleting(true)
    setError('')
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to delete account. Please try again.')
        return
      }

      // Sign out client-side session
      const supabase = createClient()
      await supabase.auth.signOut()

      toast.success('Your account has been deleted successfully')
      router.push('/login')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-6 z-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="font-bold text-[16px] text-[#0F172A] dark:text-[#F1F5F9]">
                Delete your account?
              </h3>
              <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
                This action is permanent and cannot be undone.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning list */}
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 p-4 mb-5 space-y-1.5">
          {[
            'Your profile and account settings',
            'All uploaded resumes and optimized versions',
            'Job applications and tracker history',
            'All saved jobs and match data',
          ].map(item => (
            <div key={item} className="flex items-start gap-2">
              <span className="text-red-500 mt-px text-[12px] leading-none font-bold flex-shrink-0">×</span>
              <p className="text-[12px] text-red-700 dark:text-red-300 leading-snug">{item}</p>
            </div>
          ))}
        </div>

        {/* Confirm input */}
        <div className="mb-5">
          <label className="block text-[12px] font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
            Type <span className="font-mono font-bold text-red-600 dark:text-red-400">{CONFIRM_PHRASE}</span> to confirm
          </label>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#263549] text-[13px] font-mono text-[#0F172A] dark:text-[#F1F5F9] outline-none focus:border-red-400 dark:focus:border-red-600 focus:ring-2 focus:ring-red-400/10 transition-all placeholder-gray-300 dark:placeholder-slate-600"
          />
        </div>

        {error && (
          <p className="text-[12px] text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg px-3.5 py-2.5 mb-4">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {deleting
              ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</>
              : <><Trash2 className="w-4 h-4" />Delete Account</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
