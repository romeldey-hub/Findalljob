'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Mail } from 'lucide-react'
import { LogoMark } from '@/components/LogoMark'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [sent, setSent]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1120] p-4">
        <div className="w-full max-w-[400px]">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm px-8 py-10 space-y-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <LogoMark href="/" size="sm" />
              <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
                  Check your email
                </h1>
                <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-2">
                  We sent a password reset link to{' '}
                  <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{email}</span>.
                  The link expires in 1 hour.
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="block w-full py-2.5 px-4 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#263549] text-[13px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#2E3D56] transition-colors text-center"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1120] p-4">
      <div className="w-full max-w-[400px]">

        {/* Top bar */}
        <div className="flex justify-start mb-4">
          <Link
            href="/login"
            className="flex items-center gap-1.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-[13px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Sign In
          </Link>
        </div>

        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm px-8 py-10 space-y-6">

          {/* Brand */}
          <div className="flex flex-col items-center gap-3 text-center">
            <LogoMark href="/" size="sm" />
            <div>
              <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
                Reset your password
              </h1>
              <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">
                Enter your email and we&apos;ll send you a reset link
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px]">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                required
                autoComplete="email"
                disabled={loading}
                className={error ? 'border-red-400 focus-visible:ring-red-200' : ''}
              />
            </div>

            {error && (
              <p className="text-[13px] text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </Button>
          </form>

        </div>
      </div>
    </div>
  )
}
