import type { NormalizedJob } from '@/types'

// Ordered by priority — first match wins. Includes country names + major cities.
const COUNTRY_PATTERNS: Array<{ code: string; name: string; re: RegExp }> = [
  {
    code: 'in', name: 'India',
    re: /\b(india|delhi|new delhi|mumbai|bombay|bangalore|bengaluru|chennai|madras|hyderabad|pune|poona|kolkata|calcutta|ahmedabad|jaipur|surat|lucknow|nagpur|indore|bhopal|patna|visakhapatnam|vizag|noida|gurgaon|gurugram|faridabad|thane|navi\s*mumbai|ncr|delhi[\s-]?ncr|haryana|maharashtra|karnataka|tamil\s*nadu|andhra|telangana|kerala|rajasthan|gujarat|west\s*bengal|uttar\s*pradesh|madhya\s*pradesh)\b/i,
  },
  {
    code: 'gb', name: 'United Kingdom',
    re: /\b(uk|united kingdom|great britain|england|wales|scotland|northern ireland|london|manchester|birmingham|glasgow|liverpool|bristol|leeds|sheffield|edinburgh|belfast|newcastle|nottingham|coventry|leicester)\b/i,
  },
  {
    code: 'au', name: 'Australia',
    re: /\b(australia|sydney|melbourne|brisbane|perth|adelaide|canberra|gold coast|newcastle|wollongong|queensland|victoria|nsw|new south wales|western australia)\b/i,
  },
  {
    code: 'ca', name: 'Canada',
    re: /\b(canada|toronto|vancouver|calgary|montreal|ottawa|edmonton|winnipeg|hamilton|ontario|british columbia|alberta|quebec|nova scotia|manitoba)\b/i,
  },
  {
    code: 'de', name: 'Germany',
    re: /\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|stuttgart|düsseldorf|dortmund|essen|bavaria|nordrhein)\b/i,
  },
  {
    code: 'fr', name: 'France',
    re: /\b(france|paris|lyon|marseille|toulouse|nice|nantes|strasbourg|montpellier|bordeaux)\b/i,
  },
  {
    code: 'nl', name: 'Netherlands',
    re: /\b(netherlands|holland|amsterdam|rotterdam|the hague|den haag|utrecht|eindhoven|tilburg|groningen)\b/i,
  },
  {
    code: 'sg', name: 'Singapore',
    re: /\b(singapore)\b/i,
  },
  {
    code: 'ae', name: 'UAE',
    re: /\b(uae|united arab emirates|dubai|abu dhabi|sharjah|ajman|fujairah)\b/i,
  },
  {
    code: 'nz', name: 'New Zealand',
    re: /\b(new zealand|auckland|wellington|christchurch|hamilton|tauranga|dunedin)\b/i,
  },
  {
    code: 'za', name: 'South Africa',
    re: /\b(south africa|cape town|johannesburg|durban|pretoria|port elizabeth|bloemfontein)\b/i,
  },
  {
    code: 'us', name: 'United States',
    re: /\b(usa|united states|new york|san francisco|los angeles|chicago|seattle|austin|boston|denver|dallas|miami|houston|phoenix|philadelphia|san antonio|san diego|san jose|washington\s*dc|atlanta|nashville|portland|california|texas|florida|illinois|new jersey)\b/i,
  },
]

// Job location keywords by country — used for post-fetch filtering.
// These should match what actually appears in job listing location fields.
const COUNTRY_LOCATION_RE: Partial<Record<string, RegExp>> = {
  in: /\b(india|delhi|new delhi|mumbai|bangalore|bengaluru|chennai|hyderabad|pune|kolkata|ahmedabad|jaipur|surat|lucknow|nagpur|indore|bhopal|patna|visakhapatnam|noida|gurgaon|gurugram|ncr|haryana|maharashtra|karnataka|tamil\s*nadu|andhra|telangana|kerala|rajasthan|gujarat|west\s*bengal|uttar\s*pradesh)\b/i,
  gb: /\b(uk|united kingdom|england|wales|scotland|london|manchester|birmingham|glasgow|liverpool|bristol|leeds|sheffield|edinburgh|belfast|newcastle)\b/i,
  au: /\b(australia|sydney|melbourne|brisbane|perth|adelaide|canberra|queensland|victoria|nsw)\b/i,
  ca: /\b(canada|toronto|vancouver|calgary|montreal|ottawa|edmonton|winnipeg|ontario|british columbia|alberta|quebec)\b/i,
  de: /\b(germany|deutschland|berlin|munich|hamburg|frankfurt|cologne|stuttgart)\b/i,
  us: /\b(usa|united states|new york|san francisco|los angeles|chicago|seattle|austin|boston|denver|dallas|miami|california|texas|florida|new york|new jersey)\b/i,
  sg: /\b(singapore)\b/i,
  ae: /\b(uae|dubai|abu dhabi|sharjah|united arab emirates)\b/i,
}

// Sources that are India-specific by nature — their jobs are always India even with no location field.
// Naukri and Apna only operate in India, so country filtering is not needed for them.
const INDIA_ONLY_SOURCES = new Set(['apify_naukri', 'apify_apna'])

// Patterns in job location that indicate a remote/worldwide role — always kept regardless of country
const REMOTE_RE = /\b(remote|worldwide|global|anywhere|work.?from.?home|wfh)\b/i

export interface DetectedLocation {
  countryCode: string  // ISO 2-letter lowercase, e.g. "in" — empty string if unknown
  countryName: string  // Human-readable, e.g. "India" — raw location if unknown
  city: string         // First meaningful segment of the location string
}

export function detectLocation(rawLocation: string): DetectedLocation {
  if (!rawLocation?.trim()) return { countryCode: '', countryName: '', city: '' }

  for (const { code, name, re } of COUNTRY_PATTERNS) {
    if (re.test(rawLocation)) {
      const city = rawLocation.split(/[,(]/)[0].trim()
      return { countryCode: code, countryName: name, city }
    }
  }

  // Country not recognised — keep everything but don't apply location filter
  const city = rawLocation.split(/[,(]/)[0].trim()
  return { countryCode: '', countryName: rawLocation.trim(), city }
}

/**
 * Returns true when a job's location is consistent with the target country.
 *
 * Jobs always pass if:
 * - No country code was detected (no filter applied)
 * - The job location says "remote", "worldwide", "global", etc.
 * - The job is from an India-only board (Naukri, Apna) and countryCode is "in"
 *
 * Jobs are excluded if:
 * - Location is missing/empty (unknown origin)
 * - Location matches a different country's pattern
 */
export function isJobFromCountry(job: NormalizedJob, countryCode: string): boolean {
  if (!countryCode) return true

  // Remote/worldwide roles pass for any candidate country
  if (REMOTE_RE.test(job.location || '')) return true

  // India-specific boards (Naukri, Apna) only list India jobs — no location check needed
  if (countryCode === 'in' && INDIA_ONLY_SOURCES.has(job.source)) return true

  // No location field = unknown origin → exclude when a country filter is active
  if (!job.location) return false

  const re = COUNTRY_LOCATION_RE[countryCode]
  if (!re) return true  // no filter rule for this country

  return re.test(job.location)
}

/**
 * Pure-string version of isJobFromCountry — no NormalizedJob dependency.
 * Safe to call from both server routes and client components.
 */
export function locationMatchesCountry(
  location: string | null,
  source:   string,
  countryCode: string,
): boolean {
  if (!countryCode) return true
  if (REMOTE_RE.test(location ?? '')) return true
  if (countryCode === 'in' && INDIA_ONLY_SOURCES.has(source)) return true
  if (!location) return false
  const re = COUNTRY_LOCATION_RE[countryCode]
  if (!re) return true
  return re.test(location)
}

/** Filter a job list to only include jobs from the detected country. */
export function filterJobsByCountry(
  jobs: NormalizedJob[],
  countryCode: string,
): { kept: NormalizedJob[]; removed: number } {
  if (!countryCode) return { kept: jobs, removed: 0 }
  const kept = jobs.filter((j) => isJobFromCountry(j, countryCode))
  return { kept, removed: jobs.length - kept.length }
}
