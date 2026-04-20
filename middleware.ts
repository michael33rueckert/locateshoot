import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Pages that are always public — no redirect
const PUBLIC_PATHS = [
  '/coming-soon',
  '/api/preview',
  '/not-available',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Geo block — US only ────────────────────────────────────────────────────
  const country = request.geo?.country
  if (country && country !== 'US') {
    return NextResponse.redirect(new URL('/not-available', request.url))
  }

  // ── Always allow public paths and static files ─────────────────────────────
  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  const isStaticFile = pathname.startsWith('/_next') || pathname.startsWith('/favicon')

  if (isPublicPath || isStaticFile) {
    return NextResponse.next()
  }

  // ── Check for preview cookie ───────────────────────────────────────────────
  const hasPreview = request.cookies.get('locateshoot_preview')?.value === 'true'

  if (!hasPreview) {
    return NextResponse.redirect(new URL('/coming-soon', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}