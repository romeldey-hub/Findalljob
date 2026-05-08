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
  LogOut, ChevronRight, X, ShieldCheck, Zap,
} from 'lucide-react'
import { UpgradeModal } from '@/components/UpgradeModal'
import { LogoMark } from '@/components/LogoMark'
import { track } from '@/lib/analytics'

const fetcher = (url: string) => fetch(url).then(r => r.json())

// ── Credits popup ─────────────────────────────────────────────────────────────

interface FeatureUsageRow { label: string; count: number; credits: number }

function CreditsPopup({
  remaining, total, resetDate, isPro, onClose, onUpgrade,
}: {
  remaining: number
  total: number
  resetDate: string | null
  isPro: boolean
  onClose: () => void
  onUpgrade: () => void
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
    <div className="absolute bottom-0 left-[calc(100%+8px)] w-[272px] bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-2xl z-50 overflow-hidden">
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
  const creditsRef = useRef<HTMLDivElement>(null)
  const logoutRef  = useRef<HTMLDivElement>(null)

  const { data: profileData } = useSWR('/api/profile', fetcher, { refreshInterval: 120000 })

  const isPro = subscriptionStatus === 'pro'
  const creditsRemaining: number | null = profileData?.credits_remaining ?? null
  const creditsTotal:     number | null = profileData?.credits_total     ?? null
  const creditsResetDate: string | null = profileData?.credits_reset_date ?? null

  // Close credits popup on outside click
  useEffect(() => {
    if (!showCredits) return
    function handleClick(e: MouseEvent) {
      if (creditsRef.current && !creditsRef.current.contains(e.target as Node)) {
        setShowCredits(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showCredits])

  // Close logout dropdown on outside click or ESC
  useEffect(() => {
    if (!showLogoutMenu) return
    function handleClick(e: MouseEvent) {
      if (logoutRef.current && !logoutRef.current.contains(e.target as Node)) {
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

          {/* Logout */}
          <div ref={logoutRef} className="relative ml-auto">
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
