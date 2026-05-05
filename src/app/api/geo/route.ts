import { NextRequest, NextResponse } from 'next/server'

function detectLocalhost(request: NextRequest): boolean {
  const host = (request.headers.get('host') ?? '').split(':')[0]
  const forwarded = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    forwarded === '127.0.0.1' ||
    forwarded === '::1' ||
    forwarded === ''
  )
}

export async function GET(request: NextRequest) {
  // Local development always shows India pricing
  if (detectLocalhost(request)) {
    return NextResponse.json({ countryCode: 'in' })
  }

  // Vercel sets x-vercel-ip-country on every edge request.
  // Cloudflare sets cf-ipcountry as a fallback.
  const raw =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry') ??
    ''

  return NextResponse.json({ countryCode: raw.toLowerCase() })
}
