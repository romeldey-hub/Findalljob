import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const BUCKET = 'avatars'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { avatar_url?: string }
  const dataUrl = body.avatar_url
  if (!dataUrl?.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Invalid image data' }, { status: 400 })
  }

  const base64 = dataUrl.split(',')[1]
  if (!base64) return NextResponse.json({ error: 'Malformed data URI' }, { status: 400 })

  // One deterministic file per user — always overwritten
  const storagePath = `${user.id}.jpg`

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Convert base64 → Uint8Array (universally compatible body type)
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

  console.log('[upload-avatar] user:', user.id, '| bytes:', bytes.length, '| path:', storagePath)

  // ── Upload via Supabase Storage REST API ──────────────────────────────────
  // Supabase's Kong gateway requires BOTH Authorization AND apikey headers.
  // The JS SDK sets both automatically; direct fetch must set them explicitly.
  const storageEndpoint = `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`

  const uploadRes = await fetch(storageEndpoint, {
    method: 'POST',
    headers: {
      'Authorization':  `Bearer ${serviceKey}`,
      'apikey':         serviceKey,          // required by Kong API gateway
      'Content-Type':   'image/jpeg',
      'Content-Length': String(bytes.length),
      'x-upsert':       'true',
      'cache-control':  'max-age=0',
    },
    body: bytes,
  })

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text().catch(() => uploadRes.statusText)
    console.error('[upload-avatar] storage FAILED', uploadRes.status, errBody)
    return NextResponse.json(
      { error: `Upload failed (${uploadRes.status}): ${errBody}` },
      { status: 500 },
    )
  }

  console.log('[upload-avatar] storage upload OK')

  // ── Public URL with cache-busting timestamp ───────────────────────────────
  const publicUrl =
    `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}?t=${Date.now()}`
  console.log('[upload-avatar] public URL:', publicUrl)

  // ── Persist to DB — .select().single() makes 0-row-match a real error ─────
  const admin = createAdminClient()
  const { data: saved, error: dbError } = await admin
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('user_id', user.id)
    .select('avatar_url')
    .single()

  if (dbError || !saved?.avatar_url) {
    console.error('[upload-avatar] DB update FAILED', dbError?.message ?? 'no row returned')
    return NextResponse.json(
      { error: 'Image uploaded but profile save failed. Check server logs.' },
      { status: 500 },
    )
  }

  console.log('[upload-avatar] DB updated | avatar_url:', saved.avatar_url)
  return NextResponse.json({ publicUrl: saved.avatar_url })
}
