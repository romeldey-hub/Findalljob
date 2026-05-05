import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Vercel sets x-vercel-ip-country on every edge request.
  // Cloudflare sets cf-ipcountry as a fallback.
  const raw =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry') ??
    ''

  const countryCode = raw.toLowerCase()
  return NextResponse.json({ countryCode })
}
