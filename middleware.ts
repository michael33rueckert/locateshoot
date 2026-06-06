import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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
    // Anything the client pick flow needs must be served on the custom domain
    // directly — redirecting cross-origin breaks POST fetches via CORS preflight.
    const isPickRoute =
         pathname.startsWith('/pick/')
      || pathname.startsWith('/api/pick-data/')
      || pathname === '/api/submit-pick'
      || pathname === '/api/submit-favorites'
      || pathname === '/api/place-photos'
    const isStaticAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname === '/robots.txt' || pathname === '/sitemap.xml'
    if (!isPickRoute && !isStaticAsset) {
      const redirect = new URL(pathname + (request.nextUrl.search ?? ''), `https://${APEX_DOMAIN}`)
      return NextResponse.redirect(redirect, 307)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
