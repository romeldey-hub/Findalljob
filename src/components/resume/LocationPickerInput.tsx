'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

export const COUNTRIES: string[] = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda',
  'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize',
  'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil',
  'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Central African Republic', 'Chad',
  'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba',
  'Cyprus', 'Czech Republic',
  'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia',
  'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala',
  'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein',
  'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands',
  'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia',
  'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger',
  'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman',
  'Pakistan', 'Palau', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines',
  'Poland', 'Portugal',
  'Qatar',
  'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa',
  'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia',
  'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands',
  'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka',
  'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen',
  'Zambia', 'Zimbabwe',
]

export const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  'Asia/Kolkata': 'India', 'Asia/Calcutta': 'India',
  'America/New_York': 'United States', 'America/Chicago': 'United States',
  'America/Denver': 'United States', 'America/Los_Angeles': 'United States',
  'America/Phoenix': 'United States', 'America/Anchorage': 'United States',
  'America/Detroit': 'United States', 'Pacific/Honolulu': 'United States',
  'America/Indiana/Indianapolis': 'United States',
  'Europe/London': 'United Kingdom',
  'Europe/Paris': 'France', 'Europe/Berlin': 'Germany',
  'Europe/Amsterdam': 'Netherlands', 'Europe/Brussels': 'Belgium',
  'Europe/Madrid': 'Spain', 'Europe/Rome': 'Italy',
  'Europe/Warsaw': 'Poland', 'Europe/Moscow': 'Russia',
  'Europe/Istanbul': 'Turkey', 'Europe/Kyiv': 'Ukraine', 'Europe/Kiev': 'Ukraine',
  'Europe/Stockholm': 'Sweden', 'Europe/Oslo': 'Norway',
  'Europe/Copenhagen': 'Denmark', 'Europe/Helsinki': 'Finland',
  'Europe/Zurich': 'Switzerland', 'Europe/Vienna': 'Austria',
  'Europe/Lisbon': 'Portugal', 'Europe/Athens': 'Greece',
  'Europe/Bucharest': 'Romania', 'Europe/Budapest': 'Hungary',
  'Europe/Prague': 'Czech Republic', 'Europe/Bratislava': 'Slovakia',
  'Europe/Sofia': 'Bulgaria', 'Europe/Zagreb': 'Croatia',
  'Europe/Belgrade': 'Serbia', 'Europe/Ljubljana': 'Slovenia',
  'Asia/Dubai': 'United Arab Emirates', 'Asia/Riyadh': 'Saudi Arabia',
  'Asia/Singapore': 'Singapore', 'Asia/Tokyo': 'Japan',
  'Asia/Shanghai': 'China', 'Asia/Hong_Kong': 'China', 'Asia/Taipei': 'Taiwan',
  'Asia/Seoul': 'South Korea', 'Asia/Karachi': 'Pakistan',
  'Asia/Dhaka': 'Bangladesh', 'Asia/Colombo': 'Sri Lanka',
  'Asia/Kathmandu': 'Nepal', 'Asia/Kabul': 'Afghanistan',
  'Asia/Tehran': 'Iran', 'Asia/Baghdad': 'Iraq', 'Asia/Kuwait': 'Kuwait',
  'Asia/Qatar': 'Qatar', 'Asia/Bahrain': 'Bahrain', 'Asia/Muscat': 'Oman',
  'Asia/Beirut': 'Lebanon', 'Asia/Amman': 'Jordan', 'Asia/Jerusalem': 'Israel',
  'Asia/Manila': 'Philippines', 'Asia/Jakarta': 'Indonesia',
  'Asia/Kuala_Lumpur': 'Malaysia', 'Asia/Bangkok': 'Thailand',
  'Asia/Ho_Chi_Minh': 'Vietnam', 'Asia/Saigon': 'Vietnam',
  'Asia/Rangoon': 'Myanmar', 'Asia/Yangon': 'Myanmar',
  'Asia/Almaty': 'Kazakhstan', 'Asia/Tashkent': 'Uzbekistan',
  'Asia/Tbilisi': 'Georgia', 'Asia/Yerevan': 'Armenia', 'Asia/Baku': 'Azerbaijan',
  'Africa/Cairo': 'Egypt', 'Africa/Lagos': 'Nigeria', 'Africa/Nairobi': 'Kenya',
  'Africa/Johannesburg': 'South Africa', 'Africa/Accra': 'Ghana',
  'Africa/Addis_Ababa': 'Ethiopia', 'Africa/Casablanca': 'Morocco',
  'Africa/Algiers': 'Algeria', 'Africa/Tunis': 'Tunisia',
  'Africa/Khartoum': 'Sudan', 'Africa/Tripoli': 'Libya',
  'Africa/Dar_es_Salaam': 'Tanzania', 'Africa/Kampala': 'Uganda',
  'Africa/Harare': 'Zimbabwe', 'Africa/Lusaka': 'Zambia', 'Africa/Maputo': 'Mozambique',
  'Australia/Sydney': 'Australia', 'Australia/Melbourne': 'Australia',
  'Australia/Brisbane': 'Australia', 'Australia/Perth': 'Australia',
  'Australia/Adelaide': 'Australia',
  'Pacific/Auckland': 'New Zealand', 'Pacific/Fiji': 'Fiji',
  'America/Toronto': 'Canada', 'America/Vancouver': 'Canada',
  'America/Montreal': 'Canada', 'America/Winnipeg': 'Canada',
  'America/Sao_Paulo': 'Brazil', 'America/Mexico_City': 'Mexico',
  'America/Argentina/Buenos_Aires': 'Argentina', 'America/Lima': 'Peru',
  'America/Bogota': 'Colombia', 'America/Santiago': 'Chile',
  'America/Caracas': 'Venezuela', 'America/Guayaquil': 'Ecuador',
}

export function detectCountryFromTimezone(): string {
  try {
    return TIMEZONE_TO_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? ''
  } catch {
    return ''
  }
}

export function LocationPickerInput({
  value,
  onChange,
  defaultCountry,
}: {
  value:           string
  onChange:        (v: string) => void
  defaultCountry?: string
}) {
  const isIntlInit = value === 'International'
  const [inputText,       setInputText]       = useState(isIntlInit ? '' : value)
  const [isInternational, setIsInternational] = useState(isIntlInit)
  const [suggestions,     setSuggestions]     = useState<string[]>([])
  const [showSug,         setShowSug]         = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) return
    const detected = defaultCountry || detectCountryFromTimezone()
    if (detected) { setInputText(detected); onChange(detected) }
  }, []) // mount-only: pre-fill detected country when step first opens

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSug(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function handleType(text: string) {
    setInputText(text)
    setIsInternational(false)
    onChange(text)
    if (text.length >= 1) {
      const hits = COUNTRIES.filter(c => c.toLowerCase().startsWith(text.toLowerCase())).slice(0, 8)
      setSuggestions(hits)
      setShowSug(hits.length > 0)
    } else {
      setSuggestions([])
      setShowSug(false)
    }
  }

  function pickCountry(country: string) {
    setInputText(country); setIsInternational(false)
    setSuggestions([]); setShowSug(false)
    onChange(country)
  }

  function clearInput() {
    setInputText(''); setIsInternational(false)
    setSuggestions([]); setShowSug(false)
    onChange('')
  }

  function toggleInternational() {
    if (isInternational) {
      setIsInternational(false)
      onChange(inputText)
    } else {
      setIsInternational(true)
      setSuggestions([]); setShowSug(false)
      onChange('International')
    }
  }

  return (
    <div className="flex flex-col gap-3" ref={containerRef}>
      <div>
        <label className="block text-[12px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] mb-1.5">
          Preferred work country
        </label>
        <div className="relative">
          <input
            autoFocus
            type="text"
            value={inputText}
            onChange={e => handleType(e.target.value)}
            placeholder="Start typing a country name"
            disabled={isInternational}
            className={[
              'w-full px-4 py-3 pr-9 text-[13px] border rounded-xl transition-colors',
              'bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F1F5F9]',
              'placeholder-gray-300 dark:placeholder-slate-600',
              'focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]',
              isInternational
                ? 'border-[#E5E7EB] dark:border-[#334155] opacity-40 cursor-not-allowed'
                : 'border-[#E5E7EB] dark:border-[#334155]',
            ].join(' ')}
          />
          {inputText && !isInternational && (
            <button
              type="button"
              onClick={clearInput}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          {showSug && suggestions.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 z-10 bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-lg overflow-hidden">
              {suggestions.map(c => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pickCountry(c) }}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-[#0F172A] dark:text-[#F1F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={toggleInternational}
        className={[
          'flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all',
          isInternational
            ? 'border-[#2563EB] bg-blue-50 dark:bg-[#1E3A5F]'
            : 'border-[#E5E7EB] dark:border-[#334155] hover:border-[#2563EB]/50 hover:bg-[#F8FAFC] dark:hover:bg-[#263549]',
        ].join(' ')}
      >
        <div className={[
          'mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
          isInternational
            ? 'bg-[#2563EB] border-[#2563EB]'
            : 'bg-white dark:bg-[#0F172A] border-gray-300 dark:border-slate-600',
        ].join(' ')}>
          {isInternational && (
            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
              <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div>
          <p className={[
            'text-[13px] font-semibold leading-snug',
            isInternational ? 'text-[#2563EB]' : 'text-[#0F172A] dark:text-[#F1F5F9]',
          ].join(' ')}>
            International
          </p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">
            I'm open to jobs outside my current country.
          </p>
        </div>
      </button>
    </div>
  )
}
