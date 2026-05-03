import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isProUser } from '@/lib/admin'

// Admin-only diagnostic endpoint — tests each Apify actor with a fixed query
// and returns raw results so we can see exactly what each actor returns.
// Visit: /api/debug/apify  (must be logged in as admin)

const APIFY_BASE = 'https://api.apify.com/v2'
const TOKEN      = process.env.APIFY_API_TOKEN

async function testActor(actorId: string, input: Record<string, unknown>, timeoutMs = 90_000) {
  if (!TOKEN) return { error: 'APIFY_API_TOKEN not set', items: [] }
  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body:    JSON.stringify(input),
      signal:  AbortSignal.timeout(timeoutMs),
    })
    const status = res.status
    if (!res.ok) {
      const text = await res.text()
      return { error: `HTTP ${status}: ${text.slice(0, 300)}`, items: [] }
    }
    const data  = await res.json()
    const items: unknown[] = Array.isArray(data) ? data : (data?.items ?? [])
    // Return first item as sample so we can see field names
    return { status, count: items.length, sample: items[0] ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), items: [] }
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin only
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single()
  if (!isProUser(user.email, profile?.role, null)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const tokenPresent = Boolean(TOKEN)
  const tokenPrefix  = TOKEN ? TOKEN.slice(0, 12) + '...' : 'NOT SET'

  const [indeed, naukri, linkedin] = await Promise.allSettled([
    // misceres actor requires uppercase country code ('IN' not 'in')
    testActor('misceres~indeed-scraper', {
      position: 'Software Engineer', location: 'India', keyword: 'Software Engineer', maxItems: 3, country: 'IN',
    }),
    testActor('muhammetakkurtt~naukri-job-scraper', {
      keyword: 'Software Engineer', maxJobs: 50, freshness: '30', sortBy: 'date',
    }),
    testActor('curious_coder~linkedin-jobs-scraper', {
      urls:          ['https://www.linkedin.com/jobs/search/?keywords=Software%20Engineer&location=India&f_TPR=r2592000'],
      count:         10,
      scrapeCompany: false,
    }),
  ])

  return NextResponse.json({
    token: { present: tokenPresent, prefix: tokenPrefix },
    actors: {
      indeed:   indeed.status   === 'fulfilled' ? indeed.value   : { error: indeed.reason },
      naukri:   naukri.status   === 'fulfilled' ? naukri.value   : { error: naukri.reason },
      linkedin: linkedin.status === 'fulfilled' ? linkedin.value : { error: linkedin.reason },
    },
  })
}
