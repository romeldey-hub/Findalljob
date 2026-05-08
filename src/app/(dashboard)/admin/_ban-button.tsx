'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldOff, ShieldCheck, Loader2 } from 'lucide-react'

export function BanButton({ userId, isBanned }: { userId: string; isBanned: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (!confirm(isBanned
      ? 'Unban this user and restore access?'
      : 'Ban this user? They will be signed out immediately and blocked from logging in.'))
      return

    setLoading(true)
    try {
      const res = await fetch('/api/admin/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ban: !isBanned }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        alert(`Failed: ${error}`)
        return
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <button disabled className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 dark:bg-[#263549] text-gray-400 dark:text-slate-500">
        <Loader2 className="w-3 h-3 animate-spin" />
      </button>
    )
  }

  return isBanned ? (
    <button
      onClick={toggle}
      title="Unban user"
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
    >
      <ShieldCheck className="w-3 h-3" />
      Unban
    </button>
  ) : (
    <button
      onClick={toggle}
      title="Ban user"
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors opacity-0 group-hover:opacity-100"
    >
      <ShieldOff className="w-3 h-3" />
      Ban
    </button>
  )
}
