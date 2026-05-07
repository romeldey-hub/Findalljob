'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ProfileThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Render a same-size placeholder until mounted to avoid layout shift
  if (!mounted) {
    return <span className="w-8 h-8 flex-shrink-0" />
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="w-8 h-8 flex items-center justify-center rounded-lg
                 text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200
                 hover:bg-gray-100 dark:hover:bg-white/10
                 border border-transparent hover:border-gray-200 dark:hover:border-white/10
                 transition-all duration-150"
    >
      {isDark
        ? <Sun  className="w-[15px] h-[15px]" />
        : <Moon className="w-[15px] h-[15px]" />
      }
    </button>
  )
}
