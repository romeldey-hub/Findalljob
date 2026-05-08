import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Protect dashboard routes
  const isDashboardRoute = pathname.startsWith('/(dashboard)')
    || pathname.startsWith('/resume')
    || pathname.startsWith('/matches')
    || pathname.startsWith('/optimizer')
    || pathname.startsWith('/tracker')
    || pathname.startsWith('/settings')
    || pathname.startsWith('/admin')

  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Ban check — redirect banned users to /banned (skip /banned itself to avoid loops)
  if (user && isDashboardRoute && pathname !== '/banned') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_banned')
      .eq('user_id', user.id)
      .single()

    if (profile?.is_banned) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/banned'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
