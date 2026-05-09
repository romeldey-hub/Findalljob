import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT static files and Next.js internals:
     * - _next/static  (built assets)
     * - _next/image   (image optimisation)
     * - favicon.ico, robots.txt, sitemap.xml (public files)
     * - API routes are intentionally included so the session cookie is
     *   refreshed before the route handler runs.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|eot)$).*)',
  ],
}
