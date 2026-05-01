'use client'

import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/* eslint-disable @typescript-eslint/no-explicit-any */

function PageviewTracker() {
  const pathname    = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof (window as any).gtag !== 'function') return
    const id  = process.env.NEXT_PUBLIC_GA_ID
    if (!id) return
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
    ;(window as any).gtag('config', id, { page_path: url })
  }, [pathname, searchParams])

  return null
}

// Suspense required because useSearchParams() suspends in Next.js App Router
export function Analytics() {
  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  )
}
