'use client'

import { useState, useEffect } from 'react'
import { getPricingByCountry, type Pricing } from '@/lib/pricing'

const CACHE_KEY = 'geo_country_code'

function isLocalhost(): boolean {
  try {
    const h = window.location.hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '::1'
  } catch { return false }
}

function getCachedCountry(): string | null {
  try { return sessionStorage.getItem(CACHE_KEY) } catch { return null }
}

function setCachedCountry(code: string) {
  try { sessionStorage.setItem(CACHE_KEY, code) } catch {}
}

export function usePricing(): Pricing {
  const [pricing, setPricing] = useState<Pricing>(() => {
    // Immediately return India pricing for local dev — no flash, no fetch needed
    if (isLocalhost()) return getPricingByCountry('in')
    return getPricingByCountry(getCachedCountry())
  })

  useEffect(() => {
    // Local dev: always India, skip geo fetch entirely
    if (isLocalhost()) return

    // Already cached this session — no need to re-fetch
    if (getCachedCountry() !== null) return

    fetch('/api/geo')
      .then((r) => r.json())
      .then(({ countryCode }: { countryCode: string }) => {
        setCachedCountry(countryCode ?? '')
        setPricing(getPricingByCountry(countryCode))
      })
      .catch(() => {
        // On failure: default to international pricing (already set as initial state)
      })
  }, [])

  return pricing
}
