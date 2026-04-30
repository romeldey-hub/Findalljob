'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useEffect, useState } from 'react'

const OPTIONS = [
  { value: 'light',  label: 'Light',  icon: Sun },
  { value: 'dark',   label: 'Dark',   icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

export function AppearanceCard() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render selected state client-side
  useEffect(() => { setMounted(true) }, [])

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6">
      <div className="mb-5">
        <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Appearance</h2>
        <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">Choose your preferred color theme.</p>
      </div>

      <div className="flex gap-3">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = mounted && theme === value
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={[
                'flex-1 flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all',
                active
                  ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#1E3A5F]'
                  : 'border-[#E5E7EB] dark:border-[#334155] hover:border-gray-300 dark:hover:border-[#475569] hover:bg-[#F8FAFC] dark:hover:bg-[#263549]',
              ].join(' ')}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-[#2563EB]' : 'text-gray-400 dark:text-slate-500'}`} />
              <span className={`text-[12px] font-semibold ${active ? 'text-[#2563EB]' : 'text-gray-500 dark:text-slate-400'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
