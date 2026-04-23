import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/coming-soon',
  '/api/preview',
  '/not-available',
]

// PWA installability requires the browser to fetch these without cookies. If the
// preview gate redirects them, Chrome fails to parse the manifest and refuses to
// install — you get "Add to Home Screen" (shortcut) instead of "Install app".
const PWA_PATHS = new Set([
  '/manifest.json',
  '/sw.js',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/icon.png',
])

const APEX_DOMAIN = process.env.NEXT_PUBLIC_APEX_DOMAIN ?? 'locateshoot.com'

function isPrimaryHost(host: string | null): boolean {
  if (!host) return true
  const h = host.toLowerCase().split(':')[0]
  return h === APEX_DOMAIN
    || h === `www.${APEX_DOMAIN}`
    || h === 'localhost'
    || h === '127.0.0.1'
    || h.endsWith('.vercel.app')
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host')

  // ── Geo block — US only ────────────────────────────────────────────────────
  const country = (request as any).geo?.country
  if (country && country !== 'US') {
    return NextResponse.redirect(new URL('/not-available', request.url))
  }

  // ── Custom-domain routing ──────────────────────────────────────────────────
  // If the request is on a photographer's custom domain, only `/pick/*`,
  // `/api/pick-data/*`, and framework/static assets are allowed. Everything
  // else bounces back to the main apex.
  if (!isPrimaryHost(host)) {
    const isPickRoute   = pathname.startsWith('/pick/') || pathname.startsWith('/api/pick-data/')
    const isStaticAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname === '/robots.txt' || pathname === '/sitemap.xml'
    if (!isPickRoute && !isStaticAsset) {
      const redirect = new URL(pathname + (request.nextUrl.search ?? ''), `https://${APEX_DOMAIN}`)
      return NextResponse.redirect(redirect, 307)
    }
    // Allow the pick path through on the custom domain.
    return NextResponse.next()
  }

  // ── Always allow public paths, static files, and PWA asset paths ──────────
  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  const isStaticFile = pathname.startsWith('/_next') || pathname.startsWith('/favicon')
  const isPwaPath    = PWA_PATHS.has(pathname) || pathname.startsWith('/icon.')
  // Client-facing share flow — real clients receiving a pick link don't have
  // the preview cookie, so the entire pick path (view + data + notify) must
  // bypass the pre-launch gate.
  const isClientPickPath =
       pathname.startsWith('/pick/')
    || pathname.startsWith('/api/pick-data/')
    || pathname === '/api/notify-pick'

  if (isPublicPath || isStaticFile || isPwaPath || isClientPickPath) {
    return NextResponse.next()
  }

  // ── Check for preview cookie ───────────────────────────────────────────────
  const isLocalhost = request.nextUrl.hostname === 'localhost'
  const hasPreview  = isLocalhost || request.cookies.get('locateshoot_preview')?.value === 'true'

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
