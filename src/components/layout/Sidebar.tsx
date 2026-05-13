'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import useSWR from 'swr'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  FileText, Briefcase, Settings,
  LogOut, ChevronRight, X, ShieldCheck, Zap, Share2, Check, Copy,
} from 'lucide-react'
import { UpgradeModal } from '@/components/UpgradeModal'
import { LogoMark } from '@/components/LogoMark'
import { track } from '@/lib/analytics'

const fetcher = (url: string) => fetch(url).then(r => r.json())

// ── Credits popup ─────────────────────────────────────────────────────────────

interface FeatureUsageRow { label: string; count: number; credits: number }

function CreditsPopup({
  remaining, total, resetDate, isPro, onClose, onUpgrade, mobileMode = false,
}: {
  remaining: number
  total: number
  resetDate: string | null
  isPro: boolean
  onClose: () => void
  onUpgrade: () => void
  mobileMode?: boolean
}) {
  const pct      = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0
  const isLow    = pct <= 30
  const barColor = pct > 30 ? 'bg-blue-500' : pct > 15 ? 'bg-amber-400' : 'bg-red-500'
  const resetStr = resetDate
    ? new Date(resetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const { data: usageData, isLoading: usageLoading } =
    useSWR<{ usage: FeatureUsageRow[] }>('/api/credits/usage', fetcher, { revalidateOnFocus: false })

  const usageRows = usageData?.usage ?? []

  return (
    <div className={`absolute w-[272px] bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-2xl z-50 overflow-hidden ${mobileMode ? 'bottom-full mb-2 left-0' : 'bottom-0 left-[calc(100%+8px)]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9] dark:border-[#334155]">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-500" />
          <span className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">AI Credits</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Balance */}
      <div className="px-4 py-3 border-b border-[#F1F5F9] dark:border-[#334155]">
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[32px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-none tabular-nums">
              {Math.floor(remaining)}
            </span>
            <span className="text-[13px] text-gray-400 dark:text-slate-500">remaining</span>
          </div>
          <span className="text-[12px] text-gray-400 dark:text-slate-500">of {Math.floor(total)}</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-[#263549] overflow-hidden mb-2">
          <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        {resetStr && (
          <p className="text-[11px] text-gray-400 dark:text-slate-500">Resets {resetStr}</p>
        )}
      </div>

      {/* Your AI Usage */}
      <div className="px-4 py-3 border-b border-[#F1F5F9] dark:border-[#334155]">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 mb-2.5">
          Your AI Usage
        </p>

        {usageLoading ? (
          <div className="space-y-2.5">
            {[80, 64, 72].map(w => (
              <div key={w} className="flex items-center justify-between gap-2">
                <div className={`h-2.5 rounded bg-gray-100 dark:bg-[#263549] animate-pulse`} style={{ width: `${w}%` }} />
                <div className="h-2.5 w-14 rounded bg-gray-100 dark:bg-[#263549] animate-pulse flex-shrink-0" />
              </div>
            ))}
          </div>
        ) : usageRows.length === 0 ? (
          <p className="text-[12px] text-gray-400 dark:text-slate-500 text-center py-1">
            No AI usage yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {usageRows.slice(0, 7).map(row => (
              <li key={row.label} className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-gray-600 dark:text-slate-300 truncate">{row.label}</span>
                <span className="text-[11px] text-gray-400 dark:text-slate-500 whitespace-nowrap flex-shrink-0 tabular-nums">
                  {row.count}× · {row.credits} cr
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* CTA — shown only when low/zero credits (non-Pro) or as reset note (Pro) */}
      {(isLow && !isPro) || isPro ? (
        <div className="px-4 py-3">
          {isLow && !isPro ? (
            <button
              onClick={() => { onClose(); onUpgrade() }}
              className="w-full h-8 rounded-lg bg-[#1a2742] dark:bg-[#2563EB] hover:bg-[#243453] dark:hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
            >
              Upgrade for more credits
            </button>
          ) : (
            <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center leading-relaxed">
              Credits reset monthly with your Pro plan.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ── Credits widget ────────────────────────────────────────────────────────────

function CreditsWidget({
  remaining, total, isPro, onClick,
}: {
  remaining: number | null
  total: number | null
  isPro: boolean
  onClick: () => void
}) {
  const hasData = remaining != null && total != null
  const pct     = hasData && total! > 0 ? Math.max(0, Math.min(100, (remaining! / total!) * 100)) : null
  const isLow   = pct != null && pct <= 30
  const isCrit  = pct != null && pct <= 15
  const count   = hasData ? Math.floor(remaining!) : '—'

  const iconColor = isCrit ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-blue-500 dark:text-blue-400'
  const labelColor = isCrit
    ? 'text-red-600 dark:text-red-400'
    : isLow
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-[#475569] dark:text-slate-400'
  const borderColor = isCrit
    ? 'border-red-200 dark:border-red-800/50'
    : isLow
    ? 'border-amber-200 dark:border-amber-800/50'
    : 'border-[#E9EDF2] dark:border-[#1E293B]'
  const bgColor = isCrit
    ? 'bg-red-50/60 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30'
    : isLow
    ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30'
    : 'bg-transparent hover:bg-gray-50 dark:hover:bg-[#1E293B]'
  const glowStyle: React.CSSProperties = isCrit
    ? { boxShadow: '0 0 0 1px rgba(239,68,68,0.2)' }
    : isLow
    ? { boxShadow: '0 0 0 1px rgba(245,158,11,0.2)' }
    : {}

  return (
    <button
      onClick={onClick}
      title="AI Credits"
      style={glowStyle}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer',
        bgColor, borderColor,
        isCrit && 'animate-pulse',
      )}
    >
      <Zap className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
      <span className={`text-[12px] font-semibold whitespace-nowrap tabular-nums ${labelColor}`}>
        {count} AI Credits Left
      </span>
    </button>
  )

  void isPro // available for future Pro-specific styling
}

// ── Share popover ─────────────────────────────────────────────────────────────

const SHARE_URL = 'https://www.findalljob.com'
const SHARE_MSG = encodeURIComponent(
  'I found FindAllJob useful for matching resumes with better-fit jobs, improving resumes, and preparing for interviews.\nTry it free: https://www.findalljob.com'
)
const SHARE_MSG_RAW =
  'I found FindAllJob useful for matching resumes with better-fit jobs, improving resumes, and preparing for interviews.\nTry it free: https://www.findalljob.com'

function SharePopover({ onClose, mobileMode = false }: { onClose: () => void; mobileMode?: boolean }) {
  const [copied, setCopied] = useState(false)

  function open(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(SHARE_MSG_RAW)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`absolute bottom-full mb-2 w-[260px] bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-2xl z-50 overflow-hidden ${mobileMode ? 'right-0' : 'left-0'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9] dark:border-[#334155]">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-blue-500" />
          <span className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Share FindAllJob</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-[12px] text-gray-500 dark:text-slate-400 mb-3 leading-relaxed">
          Help others apply smarter with AI-powered job matching.
        </p>
        <div className="space-y-1.5">
          <button
            onClick={() => open(`https://wa.me/?text=${SHARE_MSG}`)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#263549] transition-colors text-left"
          >
            {/* WhatsApp brand icon */}
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
            Share on WhatsApp
          </button>
          <button
            onClick={() => open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#263549] transition-colors text-left"
          >
            {/* LinkedIn brand icon */}
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            Share on LinkedIn
          </button>
          <button
            onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#263549] transition-colors text-left"
          >
            {/* Facebook brand icon */}
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Share on Facebook
          </button>
          <button
            onClick={copyLink}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#263549] transition-colors text-left"
          >
            {copied
              ? <><Check className="w-4 h-4 text-green-500 flex-shrink-0" /><span>Copied!</span></>
              : <><Copy className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-slate-500" /><span>Copy link</span></>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const BASE_NAV = [
  { href: '/resume',   label: 'My Resume',    icon: FileText },
  { href: '/matches',  label: 'Matched Jobs', icon: Briefcase },
  { href: '/settings', label: 'Settings',     icon: Settings },
]

const ADMIN_NAV = { href: '/admin', label: 'Admin', icon: ShieldCheck }

interface SidebarProps {
  userName: string
  subscriptionStatus: string
  role?: string
  avatarUrl?: string | null
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({ userName, subscriptionStatus, role = 'user', avatarUrl }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [showCredits, setShowCredits]     = useState(false)
  const [showUpgrade, setShowUpgrade]     = useState(false)
  const [showLogoutMenu, setShowLogoutMenu] = useState(false)
  const [showShare, setShowShare]         = useState(false)
  const creditsRef       = useRef<HTMLDivElement>(null)
  const logoutRef        = useRef<HTMLDivElement>(null)
  const shareRef         = useRef<HTMLDivElement>(null)
  const creditsMobileRef = useRef<HTMLDivElement>(null)
  const shareMobileRef   = useRef<HTMLDivElement>(null)
  const logoutMobileRef  = useRef<HTMLDivElement>(null)

  const { data: profileData } = useSWR('/api/profile', fetcher, { refreshInterval: 120000 })

  const isPro = subscriptionStatus === 'pro'
  const creditsRemaining: number | null = profileData?.credits_remaining ?? null
  const creditsTotal:     number | null = profileData?.credits_total     ?? null
  const creditsResetDate: string | null = profileData?.credits_reset_date ?? null

  // Close credits popup on outside click
  useEffect(() => {
    if (!showCredits) return
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      if (!creditsRef.current?.contains(t) && !creditsMobileRef.current?.contains(t)) {
        setShowCredits(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showCredits])

  // Close share popover on outside click
  useEffect(() => {
    if (!showShare) return
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      if (!shareRef.current?.contains(t) && !shareMobileRef.current?.contains(t)) {
        setShowShare(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowShare(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showShare])

  // Close logout dropdown on outside click or ESC
  useEffect(() => {
    if (!showLogoutMenu) return
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      if (!logoutRef.current?.contains(t) && !logoutMobileRef.current?.contains(t)) {
        setShowLogoutMenu(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowLogoutMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showLogoutMenu])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isAdmin = role === 'admin'
  const navItems = isAdmin ? [...BASE_NAV, ADMIN_NAV] : BASE_NAV

  const initials = (userName || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  return (
    <>
    <aside className="hidden lg:flex flex-col w-64 border-r border-gray-100 dark:border-[#1E293B] bg-white dark:bg-[#0F1B2D] h-full">

      {/* ── Logo ─────────────────────────────────────────────────── */}
      <div className="px-5 py-[18px] border-b border-gray-100 dark:border-[#1E293B]">
        <LogoMark />
      </div>

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 pt-4 pb-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                active
                  ? 'bg-[#1a2742] dark:bg-[#2563EB] text-white shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-[#1E293B] hover:text-gray-800 dark:hover:text-white'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* ── Bottom bar: credits widget + logout ──────────────────── */}
      <div className="border-t border-gray-100 dark:border-[#1E293B]">
        <div className="flex items-center px-3 py-2 gap-1">

          {/* AI Credits widget */}
          <div ref={creditsRef} className="relative">
            <CreditsWidget
              remaining={creditsRemaining}
              total={creditsTotal}
              isPro={isPro}
              onClick={() => setShowCredits(v => !v)}
            />
            {showCredits && (
              <CreditsPopup
                remaining={creditsRemaining ?? 0}
                total={creditsTotal ?? 0}
                resetDate={creditsResetDate}
                isPro={isPro}
                onClose={() => setShowCredits(false)}
                onUpgrade={() => { track.upgradeClick('credits_popup'); setShowUpgrade(true) }}
              />
            )}
          </div>

          {/* Share */}
          <div ref={shareRef} className="relative ml-auto">
            <button
              onClick={() => setShowShare(v => !v)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#1E293B] transition-colors"
              title="Share FindAllJob"
            >
              <Share2 className="w-4 h-4" />
            </button>
            {showShare && <SharePopover onClose={() => setShowShare(false)} />}
          </div>

          {/* Logout */}
          <div ref={logoutRef} className="relative">
            <button
              onClick={() => setShowLogoutMenu(v => !v)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#1E293B] transition-colors"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {showLogoutMenu && (
              <div className="absolute right-0 bottom-full mb-1 w-40 bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-lg z-20 overflow-hidden py-1">
                <button
                  onClick={() => { setShowLogoutMenu(false); handleLogout() }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-600 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors text-left"
                >
                  <LogOut className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>

        <Link href="/settings" className="flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#1E293B] transition-colors">
          <Avatar className="w-8 h-8 flex-shrink-0 overflow-hidden rounded-full">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} className="object-cover" />}
            <AvatarFallback className="text-xs bg-[#1a2742] text-white font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1a2742] dark:text-white truncate leading-tight">{userName}</p>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {isAdmin && (
                <span className="text-[10px] font-bold px-1.5 py-px rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                  Admin
                </span>
              )}
              <span className="text-[10px] font-medium px-1.5 py-px rounded bg-gray-100 dark:bg-[#1E293B] text-gray-500 dark:text-slate-400">
                {subscriptionStatus === 'pro' ? 'Pro' : 'Free'}
              </span>
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        </Link>
      </div>
    </aside>

    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 dark:border-[#1E293B] bg-white/95 dark:bg-[#0F1B2D]/95 backdrop-blur-xl px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">

      {/* Utility row: credits + share + logout */}
      <div className="flex items-center gap-2 px-1 pb-2 border-b border-gray-100 dark:border-[#1E293B] mb-2">

        {/* AI Credits */}
        <div ref={creditsMobileRef} className="relative flex-1 min-w-0">
          <CreditsWidget
            remaining={creditsRemaining}
            total={creditsTotal}
            isPro={isPro}
            onClick={() => setShowCredits(v => !v)}
          />
          {showCredits && (
            <CreditsPopup
              remaining={creditsRemaining ?? 0}
              total={creditsTotal ?? 0}
              resetDate={creditsResetDate}
              isPro={isPro}
              onClose={() => setShowCredits(false)}
              onUpgrade={() => { track.upgradeClick('credits_popup'); setShowUpgrade(true) }}
              mobileMode
            />
          )}
        </div>

        {/* Share */}
        <div ref={shareMobileRef} className="relative flex-shrink-0">
          <button
            onClick={() => setShowShare(v => !v)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#1E293B] transition-colors"
            title="Share FindAllJob"
          >
            <Share2 className="w-4 h-4" />
          </button>
          {showShare && <SharePopover onClose={() => setShowShare(false)} mobileMode />}
        </div>

        {/* Logout */}
        <div ref={logoutMobileRef} className="relative flex-shrink-0">
          <button
            onClick={() => setShowLogoutMenu(v => !v)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#1E293B] transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
          {showLogoutMenu && (
            <div className="absolute right-0 bottom-full mb-1 w-40 bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-lg z-20 overflow-hidden py-1">
              <button
                onClick={() => { setShowLogoutMenu(false); handleLogout() }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-600 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors text-left"
              >
                <LogOut className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Nav items */}
      <div className="flex items-center justify-around gap-1 overflow-x-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'min-w-[58px] flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold transition-colors',
                active
                  ? 'bg-[#1a2742] dark:bg-[#2563EB] text-white'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-[#1E293B]'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="whitespace-nowrap">{label.replace('Matched Jobs', 'Jobs').replace('My Resume', 'Resume')}</span>
            </Link>
          )
        })}
      </div>
    </nav>

    {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </>
  )
}
