import { MetadataRoute } from 'next'

const BASE = 'https://findalljob.com'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE,               lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/signup`,   lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/login`,    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ]
}
