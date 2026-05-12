'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const STORAGE_KEY = 'theme'

function getSystemResolved(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = theme === 'system' ? getSystemResolved() : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  return resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')

  // Read stored preference and apply on mount (client only)
  useEffect(() => {
    let stored: Theme = 'system'
    try { stored = (localStorage.getItem(STORAGE_KEY) as Theme) || 'system' } catch {}
    setThemeState(stored)
    setResolvedTheme(applyTheme(stored))
  }, [])

  // Re-apply whenever theme preference changes
  useEffect(() => {
    setResolvedTheme(applyTheme(theme))
  }, [theme])

  // Update when OS dark-mode preference changes while 'system' is selected
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setResolvedTheme(applyTheme('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    try { localStorage.setItem(STORAGE_KEY, t) } catch {}
    setThemeState(t)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  // Return safe fallback outside provider (SSR, Storybook, etc.)
  return ctx ?? { theme: 'system', resolvedTheme: 'light', setTheme: () => {} }
}
