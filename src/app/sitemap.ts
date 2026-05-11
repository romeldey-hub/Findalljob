import { MetadataRoute } from 'next'

const BASE = 'https://findalljob.com'

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
