import { MetadataRoute } from 'next'

const BASE = 'https://findalljob.com'

// SEO landing pages — static public marketing pages only
const SEO_PAGES = [
  '/ai-resume-optimizer',
  '/resume-job-matching',
  '/ats-resume-checker',
  '/ai-mock-interview',
  '/tailor-resume-to-job-description',
  '/job-search-india',
  '/jobs-for-product-managers',
  '/jobs-for-software-engineers',
  '/career-advice',
  '/public-resume-profile',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const seoEntries: MetadataRoute.Sitemap = SEO_PAGES.map(path => ({
    url:             `${BASE}${path}`,
    lastModified:    new Date(),
    changeFrequency: 'monthly' as const,
    priority:        0.7,
  }))

  return [
    { url: BASE,             lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/signup`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/login`,  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    ...seoEntries,
  ]
}
