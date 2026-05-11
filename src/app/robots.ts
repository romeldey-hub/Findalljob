import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
      '/api/',
      '/admin/',
      '/dashboard/',
      '/matches/',
      '/optimizer/',
      '/tracker/',
      '/settings/',
      '/resume/',
      '/forgot-password',
      '/reset-password',
      '/callback',
      '/banned',
    ],
    },
    sitemap: 'https://www.findalljob.com/sitemap.xml',
  }
}
