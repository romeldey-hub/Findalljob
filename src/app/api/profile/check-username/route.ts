import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const RESERVED = new Set([
  'login', 'signup', 'register', 'logout', 'auth', 'api', 'admin',
  'matches', 'resume', 'optimizer', 'tracker', 'settings', 'dashboard',
  'about', 'pricing', 'privacy', 'terms', 'contact', 'help', 'blog',
  'support', 'careers', 'jobs', 'u', 'profile', 'www', 'mail', 'app',
])

const USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$|^[a-z0-9]{3,40}$/

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('username') ?? ''
  const slug = raw.trim().toLowerCase()

  // Format validation first — no DB hit needed
  if (slug.length < 3)  return NextResponse.json({ status: 'invalid', reason: 'Too short — minimum 3 characters.' })
  if (slug.length > 40) return NextResponse.json({ status: 'invalid', reason: 'Too long — maximum 40 characters.' })
  if (!USERNAME_RE.test(slug)) {
    return NextResponse.json({ status: 'invalid', reason: 'Only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.' })
  }
  if (RESERVED.has(slug)) {
    return NextResponse.json({ status: 'taken', reason: 'That username is reserved.' })
  }

  // Auth — to exclude the current user from the uniqueness check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const query = admin
    .from('profiles')
    .select('user_id')
    .ilike('username', slug)

  // If logged in, exclude their own row so their existing slug reads as available
  if (user) query.neq('user_id', user.id)

  const { data } = await query.maybeSingle()

  if (data) {
    return NextResponse.json({ status: 'taken', reason: 'Already taken. Try another.' })
  }

  return NextResponse.json({ status: 'available' })
}
