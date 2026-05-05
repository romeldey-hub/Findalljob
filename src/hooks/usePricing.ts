'use client'

import { useState, useEffect } from 'react'
import { getPricingByCountry, type Pricing } from '@/lib/pricing'

const CACHE_KEY = 'geo_country_code'

function getCachedCountry(): string | null {
  try { return sessionStorage.getItem(CACHE_KEY) } catch { return null }
}

function setCachedCountry(code: string) {
  try { sessionStorage.setItem(CACHE_KEY, code) } catch {}
}

export function usePricing(): Pricing {
  const [pricing, setPricing] = useState<Pricing>(() =>
    getPricingByCountry(getCachedCountry())
  )

  useEffect(() => {
    // Already cached this session — no need to re-fetch
    if (getCachedCountry() !== null) return

    fetch('/api/geo')
      .then((r) => r.json())
      .then(({ countryCode }: { countryCode: string }) => {
        setCachedCountry(countryCode ?? '')
        setPricing(getPricingByCountry(countryCode))
      })
      .catch(() => {})
  }, [])

  return pricing
}
