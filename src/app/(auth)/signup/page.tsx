'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, X, Mail } from 'lucide-react'
import { LogoMark } from '@/components/LogoMark'

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName]           = useState('')
  const [email, setEmail]                 = useState('')
  const [password, setPassword]           = useState('')
  const [showPassword, setShowPassword]   = useState(false)
  const [loading, setLoading]             = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]                 = useState('')
  const [success, setSuccess]             = useState(false)

  useEffect(() => {
    const handleFocus = () => { if (googleLoading) setGoogleLoading(false) }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [googleLoading])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !email.trim() || !password) return
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(
        error.message.toLowerCase().includes('already registered')
          ? 'An account with this email already exists. Try signing in.'
          : error.message
      )
      setLoading(false)
    } else {
      setSuccess(true)
    }
  }

  async function handleGoogleSignup() {
    setError('')
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError('Could not connect to Google. Please try again.')
      setGoogleLoading(false)
    }
  }

  const busy = loading || googleLoading

  if (success) {
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
                  We sent a confirmation link to{' '}
                  <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{email}</span>.
                  Click it to activate your account.
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
        <div className="flex justify-end mb-4">
          <Link
            href="/"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            aria-label="Back to home"
          >
            <X className="w-4 h-4" />
          </Link>
        </div>

        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm px-8 py-10 space-y-6">

          {/* Brand */}
          <div className="flex flex-col items-center gap-3 text-center">
            <LogoMark href="/" size="sm" />
            <div>
              <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-tight">
                Create your account
              </h1>
              <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">
                Start your AI-powered job search
              </p>
            </div>
          </div>

          {/* Google */}
          <button
            onClick={handleGoogleSignup}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#263549] text-[13px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#2E3D56] transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            {googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
          </button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E5E7EB] dark:border-[#334155]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-[#1E293B] px-3 text-[11px] uppercase tracking-widest text-gray-400 dark:text-slate-500">
                or
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-[13px]">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Jane Smith"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); setError('') }}
                required
                autoComplete="name"
                disabled={busy}
              />
            </div>

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
                disabled={busy}
                className={error ? 'border-red-400 focus-visible:ring-red-200' : ''}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[13px]">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  minLength={8}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  required
                  autoComplete="new-password"
                  disabled={busy}
                  className={`pr-10 ${error ? 'border-red-400 focus-visible:ring-red-200' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-[13px] text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {loading ? 'Creating account…' : 'Create Account'}
            </Button>
          </form>

          {/* Switch to login */}
          <p className="text-center text-[13px] text-gray-500 dark:text-slate-400">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-semibold text-[#0F172A] dark:text-[#F1F5F9] hover:underline"
            >
              Sign in
            </Link>
          </p>

        </div>
      </div>
    </div>
  )
}
