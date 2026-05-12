'use client'

import { useState } from 'react'
import { Globe, MapPin, ChevronDown } from 'lucide-react'
import { LocationPickerInput, COUNTRIES } from './LocationPickerInput'

// Maps country display names → 2-letter codes for the supported job search countries
const SUPPORTED_NAME_TO_CODE: Record<string, string> = {
  'India': 'in', 'United States': 'us', 'United Kingdom': 'gb',
  'Canada': 'ca', 'Australia': 'au', 'Germany': 'de', 'France': 'fr',
  'Netherlands': 'nl', 'Singapore': 'sg', 'UAE': 'ae',
  'United Arab Emirates': 'ae', 'New Zealand': 'nz', 'South Africa': 'za',
}

// Normalize display aliases to canonical country names
const NORMALIZE_NAME: Record<string, string> = { 'UAE': 'United Arab Emirates' }

export const COUNTRY_LIST = [
  { code: 'in', name: 'India' },
  { code: 'us', name: 'United States' },
  { code: 'gb', name: 'United Kingdom' },
  { code: 'ca', name: 'Canada' },
  { code: 'au', name: 'Australia' },
  { code: 'de', name: 'Germany' },
  { code: 'fr', name: 'France' },
  { code: 'nl', name: 'Netherlands' },
  { code: 'sg', name: 'Singapore' },
  { code: 'ae', name: 'UAE' },
  { code: 'nz', name: 'New Zealand' },
  { code: 'za', name: 'South Africa' },
]

export const COUNTRY_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  COUNTRY_LIST.map((c) => [c.code, c.name])
)

export type CountryChoice =
  | { searchMode: 'country'; selectedSearchCountry: string; wasDetected: boolean }
  | { searchMode: 'international_remote'; selectedSearchCountry: null; wasDetected: false }

type Props = {
  detectedCountryCode: string | null
  detectedCountryName: string | null
  savedPreferredCode: string | null
  onConfirm: (choice: CountryChoice) => void
  context?: 'initial_analysis' | 'change_search_location'
  activeCountryName?: string | null
  activeCountryMode?: 'country' | 'international_remote' | null
}

export function CountryConfirmStep({
  detectedCountryCode,
  detectedCountryName,
  savedPreferredCode,
  onConfirm,
  context = 'initial_analysis',
  activeCountryName,
  activeCountryMode,
}: Props) {
  // Only treat the country as "detected" when we have a usable code (recognised country).
  // If the resume has a location string but it's not in COUNTRY_PATTERNS (e.g. "Kathmandu, Nepal"),
  // detectedCountryCode is null and there's no country code to search with — fall through to plain picker.
  const hasDetected = Boolean(detectedCountryName && detectedCountryCode)

  const defaultCode =
    savedPreferredCode ??
    detectedCountryCode ??
    COUNTRY_LIST[0].code

  const [showPicker, setShowPicker] = useState(!hasDetected)
  const [selectedCode, setSelectedCode] = useState<string>(defaultCode)

  // State for change_search_location context — must be declared before any early return
  const rawInitName = activeCountryMode === 'international_remote'
    ? 'International'
    : (activeCountryName ?? '')
  const [locationValue, setLocationValue] = useState(NORMALIZE_NAME[rawInitName] ?? rawInitName)

  function confirmNewLocation() {
    if (locationValue === 'International') {
      onConfirm({ searchMode: 'international_remote', selectedSearchCountry: null, wasDetected: false })
    } else {
      const code = SUPPORTED_NAME_TO_CODE[locationValue] ?? locationValue
      onConfirm({ searchMode: 'country', selectedSearchCountry: code, wasDetected: false })
    }
  }

  function confirmDetected() {
    if (!detectedCountryCode) return
    onConfirm({
      searchMode: 'country',
      selectedSearchCountry: detectedCountryCode,
      wasDetected: true,
    })
  }

  function confirmChosen() {
    onConfirm({
      searchMode: 'country',
      selectedSearchCountry: selectedCode,
      wasDetected: selectedCode === detectedCountryCode,
    })
  }

  function confirmInternational() {
    onConfirm({
      searchMode: 'international_remote',
      selectedSearchCountry: null,
      wasDetected: false,
    })
  }

  if (context === 'change_search_location') {
    const canConfirm = locationValue === 'International' || COUNTRIES.includes(locationValue)
    return (
      <div className="rounded-2xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#1E293B] shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-[#1E3A5F] flex items-center justify-center flex-shrink-0 mt-0.5">
            <Globe className="w-4 h-4 text-[#2563EB]" />
          </div>
          <div>
            <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Change job search location</p>
            <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              {activeCountryMode === 'international_remote' ? (
                <span>Currently showing international / remote jobs. </span>
              ) : activeCountryName ? (
                <span>Currently showing jobs in <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{activeCountryName}</span>. </span>
              ) : null}
              Choose where you want to search for jobs.
            </p>
          </div>
        </div>

        <LocationPickerInput value={locationValue} onChange={setLocationValue} />

        <button
          onClick={confirmNewLocation}
          disabled={!canConfirm}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-semibold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <MapPin className="w-3.5 h-3.5" />
          Search here
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#1E293B] shadow-sm p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-[#1E3A5F] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Globe className="w-4 h-4 text-[#2563EB]" />
        </div>
        <div>
          <p className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">
            {hasDetected ? 'Confirm job search location' : 'Choose job search location'}
          </p>
          <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            {hasDetected ? (
              <>
                We detected your resume country as{' '}
                <span className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                  {detectedCountryName}
                </span>
                . Where do you want to search for jobs?
              </>
            ) : (
              "We couldn't detect your resume country. Where should we search for jobs?"
            )}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {/* Primary action: confirm detected country (only when detected and picker not shown) */}
        {hasDetected && !showPicker && (
          <button
            onClick={confirmDetected}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border-2 border-[#2563EB] bg-blue-50 dark:bg-[#1E3A5F] text-[13px] font-semibold text-[#2563EB] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-[#1E3A5F]/80 transition-colors text-left"
          >
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            Continue with {detectedCountryName}
          </button>
        )}

        {/* Show country picker */}
        {!showPicker && (
          <button
            onClick={() => setShowPicker(true)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors text-left"
          >
            {hasDetected ? 'Choose another country' : 'Choose country'}
          </button>
        )}

        {/* Country dropdown + confirm button */}
        {showPicker && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <select
                value={selectedCode}
                onChange={(e) => setSelectedCode(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 pr-8 rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#263549] text-[13px] text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 cursor-pointer"
              >
                {COUNTRY_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <button
              onClick={confirmChosen}
              className="px-4 py-2.5 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-semibold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              Search here
            </button>
          </div>
        )}

        {/* International / remote */}
        <button
          onClick={confirmInternational}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-medium text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors text-left"
        >
          <Globe className="w-3.5 h-3.5 flex-shrink-0" />
          Search international / remote jobs
        </button>
      </div>
    </div>
  )
}
