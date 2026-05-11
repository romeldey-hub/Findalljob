import { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/server'

// Force server-side render on every request so the DB query runs at runtime,
// not at build time when SUPABASE_SERVICE_ROLE_KEY may be unavailable.
export const dynamic = 'force-dynamic'

const BASE = 'https://www.findalljob.com'

// SEO landing pages — static public marketing pages only
const SEO_PAGES = [
  // Feature pages
  '/ai-resume-optimizer',
  '/resume-job-matching',
  '/ats-resume-checker',
  '/ai-mock-interview',
  '/tailor-resume-to-job-description',
  '/job-search-india',
  '/career-advice',
  '/public-resume-profile',
  // Role-based pages (batch 1)
  '/jobs-for-product-managers',
  '/jobs-for-software-engineers',
  // Role-based pages (batch 2)
  '/jobs-for-data-analysts',
  '/jobs-for-data-scientists',
  '/jobs-for-ai-engineers',
  '/jobs-for-full-stack-developers',
  '/jobs-for-devops-engineers',
  '/jobs-for-ui-ux-designers',
  '/jobs-for-machine-learning-engineers',
  '/jobs-for-cloud-engineers',
  '/jobs-for-cybersecurity-analysts',
  '/jobs-for-business-analysts',
  '/jobs-for-digital-marketing-managers',
  '/jobs-for-sales-managers',
]

// Reserved slugs that are app routes, never user profiles
const RESERVED = new Set([
  'signup', 'login', 'dashboard', 'admin', 'api', 'sitemap', 'robots',
  'banned', 'jobs', 'pricing', 'about', 'contact', 'help',
  'settings', 'profile', 'matches', 'optimize', 'interview', 'applications',
  'resume', 'onboarding', 'verify', 'reset-password', 'forgot-password',
])

async function fetchEligibleProfiles(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createAdminClient()

    // Fetch candidates: public profiles with slug, full_name, and headline present.
    // Skills live in resumes.parsed_data so we join via user_id and filter in JS.
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('username, full_name, headline, updated_at, user_id')
      .eq('profile_public', true)
      .not('username', 'is', null)
      .neq('username', '')
      .not('full_name', 'is', null)
      .neq('full_name', '')
      .not('headline', 'is', null)
      .neq('headline', '')
      .limit(2000)

    if (error || !profiles?.length) return []

    // Fetch the active resume for each candidate — must match is_active = true,
    // same filter the public profile page uses (src/app/[username]/page.tsx)
    const userIds = profiles.map(p => p.user_id)
    const { data: resumes } = await supabase
      .from('resumes')
      .select('user_id, parsed_data')
      .in('user_id', userIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    // Build a map: user_id → skills array (from the newest resume)
    const skillsMap = new Map<string, string[]>()
    for (const r of resumes ?? []) {
      if (!skillsMap.has(r.user_id)) {
        const skills: string[] = r.parsed_data?.skills ?? []
        skillsMap.set(r.user_id, skills)
      }
    }

    const entries: MetadataRoute.Sitemap = []
    for (const p of profiles) {
      const slug = p.username as string

      // Skip reserved app routes
      if (RESERVED.has(slug.toLowerCase())) continue

      // Require at least 3 skills — the primary content-quality gate
      const skills = skillsMap.get(p.user_id) ?? []
      if (skills.length < 3) continue

      entries.push({
        url:             `${BASE}/${slug}`,
        lastModified:    p.updated_at ? new Date(p.updated_at) : new Date(),
        changeFrequency: 'weekly' as const,
        priority:        0.7,
      })
    }

    return entries
  } catch (err) {
    console.error('[sitemap] Failed to fetch eligible public profiles:', err)
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seoEntries: MetadataRoute.Sitemap = SEO_PAGES.map(path => ({
    url:             `${BASE}${path}`,
    lastModified:    new Date(),
    changeFrequency: 'monthly' as const,
    priority:        0.7,
  }))

  const profileEntries = await fetchEligibleProfiles()

  return [
    { url: BASE,              lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/about`,   lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    ...seoEntries,
    ...profileEntries,
  ]
}
