import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const RESERVED = new Set([
  'login', 'signup', 'register', 'logout', 'auth', 'api', 'admin',
  'matches', 'resume', 'optimizer', 'tracker', 'settings', 'dashboard',
  'about', 'pricing', 'privacy', 'terms', 'contact', 'help', 'blog',
  'support', 'careers', 'jobs', 'u', 'profile', 'www', 'mail', 'app',
])

const USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

function normaliseSocialUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null
  const s = String(raw).trim()
  if (!s) return null
  return s.startsWith('http://') || s.startsWith('https://') ? s : `https://${s}`
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select(`
      username, profile_public,
      show_email, show_phone, show_resume_download, open_to_opportunities,
      linkedin_url, show_linkedin,
      x_url, show_x,
      facebook_url, show_facebook
    `)
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    username:              data?.username              ?? null,
    profile_public:        data?.profile_public        ?? false,
    show_email:            data?.show_email            ?? false,
    show_phone:            data?.show_phone            ?? false,
    show_resume_download:  data?.show_resume_download  ?? true,
    open_to_opportunities: data?.open_to_opportunities ?? true,
    linkedin_url:          data?.linkedin_url          ?? '',
    show_linkedin:         data?.show_linkedin         ?? false,
    x_url:                 data?.x_url                 ?? '',
    show_x:                data?.show_x                ?? false,
    facebook_url:          data?.facebook_url          ?? '',
    show_facebook:         data?.show_facebook         ?? false,
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    username,
    profile_public,
    show_email,
    show_phone,
    show_resume_download,
    open_to_opportunities,
    linkedin_url,
    show_linkedin,
    x_url,
    show_x,
    facebook_url,
    show_facebook,
  } = body

  const admin = createAdminClient()

  // Validate username if provided
  if (username !== undefined && username !== null && username !== '') {
    const slug = String(username).trim().toLowerCase()

    if (!USERNAME_RE.test(slug)) {
      return NextResponse.json(
        { error: 'Username must be 3–30 characters, only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.' },
        { status: 400 }
      )
    }
    if (RESERVED.has(slug)) {
      return NextResponse.json({ error: 'That username is reserved.' }, { status: 400 })
    }

    const { data: existing } = await admin
      .from('profiles')
      .select('user_id')
      .ilike('username', slug)
      .neq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Username already taken. Please choose another.' }, { status: 409 })
    }
  }

  const updates: Record<string, unknown> = {}
  if (username !== undefined)               updates.username              = username === '' ? null : String(username).trim().toLowerCase()
  if (profile_public !== undefined)         updates.profile_public        = Boolean(profile_public)
  if (show_email !== undefined)             updates.show_email            = Boolean(show_email)
  if (show_phone !== undefined)             updates.show_phone            = Boolean(show_phone)
  if (show_resume_download !== undefined)   updates.show_resume_download  = Boolean(show_resume_download)
  if (open_to_opportunities !== undefined)  updates.open_to_opportunities = Boolean(open_to_opportunities)
  if (linkedin_url !== undefined)           updates.linkedin_url          = normaliseSocialUrl(linkedin_url)
  if (show_linkedin !== undefined)          updates.show_linkedin         = Boolean(show_linkedin)
  if (x_url !== undefined)                  updates.x_url                 = normaliseSocialUrl(x_url)
  if (show_x !== undefined)                 updates.show_x                = Boolean(show_x)
  if (facebook_url !== undefined)           updates.facebook_url          = normaliseSocialUrl(facebook_url)
  if (show_facebook !== undefined)          updates.show_facebook         = Boolean(show_facebook)

  const { error } = await admin
    .from('profiles')
    .update(updates)
    .eq('user_id', user.id)

  if (error) {
    console.error('[public-settings] update error:', error.message, error.code)
    const hint = error.message?.includes('column')
      ? 'Database migration not applied — run migration 019_social_links.sql in your Supabase SQL editor.'
      : error.message
    return NextResponse.json({ error: hint }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
