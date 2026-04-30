'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import useSWR, { mutate as globalMutate } from 'swr'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  FileText, Briefcase, Wand2, Kanban, Settings,
  LogOut, ChevronRight, Crown, Bell, HelpCircle,
  CheckCheck, Loader2, Trash2, AlertTriangle, CheckSquare, X, ShieldCheck,
} from 'lucide-react'
import { HelpModal } from '@/components/HelpModal'
import { UpgradeModal } from '@/components/UpgradeModal'

const fetcher = (url: string) => fetch(url).then(r => r.json())

// ── Types ─────────────────────────────────────────────────────────────────────

type NotifType = 'resume' | 'application' | 'jobs' | 'system'

interface Notification {
  id: string
  type: NotifType
  title: string
  body: string
  cta_label: string | null
  cta_href: string | null
  is_read: boolean
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_META: Record<NotifType, { bg: string; iconColor: string; icon: React.ElementType }> = {
  jobs:        { bg: 'bg-green-100 dark:bg-green-900/30',  iconColor: 'text-green-600 dark:text-green-400',  icon: Briefcase },
  resume:      { bg: 'bg-blue-100 dark:bg-blue-900/30',    iconColor: 'text-blue-600 dark:text-blue-400',    icon: FileText },
  application: { bg: 'bg-blue-100 dark:bg-blue-900/30',    iconColor: 'text-blue-600 dark:text-blue-400',    icon: CheckSquare },
  system:      { bg: 'bg-amber-100 dark:bg-amber-900/30',  iconColor: 'text-amber-600 dark:text-amber-400',  icon: AlertTriangle },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Notifications popup ───────────────────────────────────────────────────────

function NotificationsPopup({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [tab, setTab]         = useState<'all' | 'unread'>('all')
  const [marking, setMarking] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const { data, isLoading } = useSWR('/api/notifications', fetcher, { refreshInterval: 30000 })
  const notifications: Notification[] = data?.notifications ?? []
  const unreadCount: number = data?.unreadCount ?? 0

  const visible = tab === 'unread' ? notifications.filter(n => !n.is_read) : notifications

  const markRead = useCallback(async (id: string, isRead: boolean) => {
    if (isRead) return
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    globalMutate('/api/notifications')
  }, [])

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) return
    setMarking(true)
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
    })
    globalMutate('/api/notifications')
    setMarking(false)
  }, [unreadCount])

  const deleteNotif = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(id)
    await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' })
    globalMutate('/api/notifications')
    setDeleting(null)
  }, [])

  const handleCta = useCallback((n: Notification, e: React.MouseEvent) => {
    e.stopPropagation()
    markRead(n.id, n.is_read)
    if (n.cta_href) { router.push(n.cta_href); onClose() }
  }, [markRead, router, onClose])

  return (
    <div className="absolute bottom-12 left-[calc(100%+8px)] w-[360px] bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-2xl z-50 flex flex-col overflow-hidden"
      style={{ maxHeight: 480 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9] dark:border-[#334155] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Notifications</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-px rounded-full text-[10px] font-bold bg-[#2563EB] text-white leading-none">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={marking}
              title="Mark all as read"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors"
            >
              {marking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#F1F5F9] dark:border-[#334155] flex-shrink-0">
        {(['all', 'unread'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-1 rounded-lg text-[12px] font-semibold transition-colors capitalize',
              tab === t
                ? 'bg-[#0F172A] dark:bg-[#2563EB] text-white'
                : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#334155]'
            )}
          >
            {t === 'unread' && unreadCount > 0 ? `Unread (${unreadCount})` : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-4 h-4 animate-spin text-gray-300 dark:text-slate-600" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <Bell className="w-8 h-8 text-gray-200 dark:text-slate-700 mb-2" />
            <p className="text-[13px] font-semibold text-gray-500 dark:text-slate-400">
              {tab === 'unread' ? 'All caught up' : 'No notifications yet'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F1F5F9] dark:divide-[#334155]">
            {visible.map(n => {
              const meta = TYPE_META[n.type] ?? TYPE_META.system
              const Icon = meta.icon
              return (
                <li
                  key={n.id}
                  onClick={() => markRead(n.id, n.is_read)}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors group',
                    n.is_read
                      ? 'hover:bg-[#F8FAFC] dark:hover:bg-[#263549]/50'
                      : 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                  )}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${meta.iconColor}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        'text-[13px] leading-snug',
                        n.is_read ? 'font-medium text-gray-600 dark:text-slate-300' : 'font-bold text-[#0F172A] dark:text-[#F1F5F9]'
                      )}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 whitespace-nowrap">
                          {timeAgo(n.created_at)}
                        </span>
                        {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] flex-shrink-0" />}
                      </div>
                    </div>
                    {n.body && (
                      <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    {n.cta_label && n.cta_href && (
                      <button
                        onClick={e => handleCta(n, e)}
                        className="mt-1.5 text-[11px] font-semibold text-[#2563EB] hover:underline"
                      >
                        {n.cta_label} →
                      </button>
                    )}
                  </div>

                  <button
                    onClick={e => deleteNotif(n.id, e)}
                    disabled={deleting === n.id}
                    className="p-1 rounded-lg text-transparent group-hover:text-gray-300 dark:group-hover:text-slate-600 hover:!text-gray-500 dark:hover:!text-slate-400 hover:bg-gray-100 dark:hover:bg-[#334155] transition-all flex-shrink-0"
                  >
                    {deleting === n.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2 className="w-3 h-3" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const BASE_NAV = [
  { href: '/resume',    label: 'My Resume',   icon: FileText },
  { href: '/matches',   label: 'Job Matches', icon: Briefcase },
  { href: '/optimizer', label: 'Optimizer',   icon: Wand2 },
  { href: '/tracker',   label: 'Tracker',     icon: Kanban },
  { href: '/settings',  label: 'Settings',    icon: Settings },
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
  const [showNotifs, setShowNotifs]   = useState(false)
  const [showHelp, setShowHelp]       = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  const { data: notifData } = useSWR('/api/notifications', fetcher, { refreshInterval: 30000 })
  const unreadCount: number = notifData?.unreadCount ?? 0

  // Close popup on outside click
  useEffect(() => {
    if (!showNotifs) return
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowNotifs(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showNotifs])

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
    <aside className="flex flex-col w-64 border-r border-gray-100 dark:border-[#1E293B] bg-white dark:bg-[#0F1B2D] h-full">

      {/* ── Logo ─────────────────────────────────────────────────── */}
      <div className="px-5 py-[18px] border-b border-gray-100 dark:border-[#1E293B]">
        <Link href="/matches" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-sm flex-shrink-0">
            <Briefcase className="w-[18px] h-[18px] text-white" />
          </div>
          <span className="font-bold text-[17px] text-[#1a2742] dark:text-white tracking-tight leading-none">
            Find All Job
          </span>
        </Link>
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

      {/* ── Upgrade card (free only) ──────────────────────────────── */}
      {subscriptionStatus === 'free' && (
        <div className="px-3 pb-3">
          <div className="rounded-xl border border-gray-100 dark:border-[#1E293B] bg-gray-50 dark:bg-[#1E293B] p-4">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="font-bold text-sm text-[#1a2742] dark:text-white">Upgrade to Pro</p>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-snug mb-3">
              Unlock unlimited optimizations, AI cover letters &amp; more.
            </p>
            <button
              onClick={() => setShowUpgrade(true)}
              className="w-full h-8 rounded-lg bg-[#1a2742] dark:bg-[#2563EB] hover:bg-[#243453] dark:hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
            >
              Upgrade Now
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom bar: icons + user ──────────────────────────────── */}
      <div className="border-t border-gray-100 dark:border-[#1E293B]">
        <div className="flex items-center px-3 py-2 gap-1">

          {/* Bell with popup */}
          <div ref={bellRef} className="relative">
            <button
              onClick={() => setShowNotifs(v => !v)}
              className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#1E293B] transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#2563EB] ring-2 ring-white dark:ring-[#0F1B2D]" />
              )}
            </button>
            {showNotifs && <NotificationsPopup onClose={() => setShowNotifs(false)} />}
          </div>

          <button
            onClick={() => setShowHelp(true)}
            title="Help & Support"
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#1E293B] transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors ml-auto"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
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

    {showHelp    && <HelpModal    onClose={() => setShowHelp(false)} />}
    {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
</>
  )
}
