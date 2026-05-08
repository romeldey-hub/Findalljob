'use client'

import { useState, useEffect } from 'react'
import { getRegionPricing, type RegionPricing } from '@/lib/pricing'

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

export function usePricing(): RegionPricing {
  const [region, setRegion] = useState<RegionPricing>(() => {
    if (isLocalhost()) return getRegionPricing('in')
    return getRegionPricing(getCachedCountry())
  })

  useEffect(() => {
    if (isLocalhost()) return
    if (getCachedCountry() !== null) return

    fetch('/api/geo')
      .then((r) => r.json())
      .then(({ countryCode }: { countryCode: string }) => {
        setCachedCountry(countryCode ?? '')
        setRegion(getRegionPricing(countryCode))
      })
      .catch(() => {})
  }, [])

  return region
}
