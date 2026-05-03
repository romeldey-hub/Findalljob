import type { JobSourceAdapter, JobSearchParams } from '../types'
import type { NormalizedJob } from '@/types'

// Country names — passing these as Adzuna `where` returns no results
// because `where` expects a city, and the country is already encoded in the URL path.
const COUNTRY_ONLY_NAMES = new Set([
  'india', 'usa', 'us', 'united states', 'uk', 'united kingdom', 'canada',
  'australia', 'germany', 'france', 'netherlands', 'singapore', 'new zealand',
  'south africa', 'uae', 'united arab emirates', 'pakistan', 'bangladesh',
])

/** Infer Adzuna country code from a free-text location string. */
function detectCountryCode(location: string): string {
  const l = location.toLowerCase()
  if (/\b(india|delhi|mumbai|bangalore|bengaluru|chennai|hyderabad|pune|kolkata|ahmedabad|jaipur|surat|lucknow|nagpur|vadodara|indore|bhopal|patna|visakhapatnam|noida|gurgaon|gurugram)\b/.test(l)) return 'in'
  if (/\b(uk|united kingdom|england|london|manchester|birmingham|glasgow|liverpool|bristol|leeds|sheffield)\b/.test(l)) return 'gb'
  if (/\b(australia|sydney|melbourne|brisbane|perth|adelaide|canberra)\b/.test(l)) return 'au'
  if (/\b(canada|toronto|vancouver|calgary|montreal|ottawa|edmonton|winnipeg)\b/.test(l)) return 'ca'
  if (/\b(germany|berlin|munich|hamburg|frankfurt|cologne|stuttgart)\b/.test(l)) return 'de'
  if (/\b(france|paris|lyon|marseille|toulouse|nice|nantes)\b/.test(l)) return 'fr'
  if (/\b(netherlands|amsterdam|rotterdam|the hague|utrecht|eindhoven)\b/.test(l)) return 'nl'
  if (/\b(singapore)\b/.test(l)) return 'sg'
  if (/\b(new zealand|auckland|wellington|christchurch)\b/.test(l)) return 'nz'
  if (/\b(south africa|cape town|johannesburg|durban|pretoria)\b/.test(l)) return 'za'
  return 'us'
}

/**
 * Extract just the city from "City, Country".
 * Returns empty string if the location is a country-only name (no city),
 * so the Adzuna `where` param is omitted — country is already in the URL path.
 */
function extractCity(location: string): string {
  const city = location.split(',')[0].trim()
  // If the "city" is just a country name, omit it to avoid zero-result searches
  return COUNTRY_ONLY_NAMES.has(city.toLowerCase()) ? '' : city
}

export class AdzunaAdapter implements JobSourceAdapter {
  id = 'adzuna'
  name = 'Adzuna'
  priority = 1

  private appId  = process.env.ADZUNA_APP_ID!
  private appKey = process.env.ADZUNA_APP_KEY!

  async isAvailable(): Promise<boolean> {
    return Boolean(this.appId && this.appKey)
  }

  async search(params: JobSearchParams): Promise<NormalizedJob[]> {
    const country = params.countryCode ?? detectCountryCode(params.location)
    const limit   = Math.min(params.limit ?? 20, 50)
    const what    = encodeURIComponent(params.title.trim())
    const city    = extractCity(params.location)
    const where   = city ? `&where=${encodeURIComponent(city)}` : ''

    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1` +
      `?app_id=${this.appId}&app_key=${this.appKey}` +
      `&results_per_page=${limit}&what=${what}${where}&content-type=application/json`

    console.log(`[adzuna] GET country=${country} what="${params.title}" where="${city}"`)

    const response = await fetch(url)
    console.log(`[adzuna] status=${response.status}`)
    if (!response.ok) throw new Error(`Adzuna API error: ${response.status}`)

    const data    = await response.json()
    const results = data.results ?? []
    console.log(`[adzuna] received ${results.length} jobs`)

    return results.map((job: Record<string, unknown>) => ({
      externalId: String(job.id),
      source:     'adzuna' as const,
      title:      String(job.title ?? ''),
      company:    String((job.company as Record<string, unknown>)?.display_name ?? 'Unknown'),
      location:   String((job.location as Record<string, unknown>)?.display_name ?? params.location),
      description: String(job.description ?? ''),
      url:         String(job.redirect_url ?? ''),
      postedAt:    job.created ? new Date(String(job.created)).toISOString() : undefined,
      salary:      job.salary_min
        ? `$${Math.round(Number(job.salary_min) / 1000)}k – $${Math.round(Number(job.salary_max ?? job.salary_min) / 1000)}k`
        : undefined,
    }))
  }
}
