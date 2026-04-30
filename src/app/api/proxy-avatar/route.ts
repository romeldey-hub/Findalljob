import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
  if (!url.startsWith('https://')) {
    return NextResponse.json({ error: 'only https allowed' }, { status: 400 })
  }

  try {
    const res = await fetch(url, { headers: { Accept: 'image/*' } })
    if (!res.ok) return NextResponse.json({ error: 'upstream error' }, { status: 502 })

    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'not an image' }, { status: 400 })
    }

    const body = await res.arrayBuffer()
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'proxy failed' }, { status: 500 })
  }
}
