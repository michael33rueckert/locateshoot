import { NextResponse } from 'next/server'

// Coming-soon gate. Visit /api/preview?code=<PREVIEW_CODE>&redirect=/dashboard
// to set the bypass cookie. The code MUST come from the PREVIEW_CODE env var
// (server-only, never NEXT_PUBLIC_) so it isn't visible in the GitHub repo —
// otherwise anyone with repo access bypasses the gate.

// Validate that a redirect target is same-origin and relative. Without this
// check, ?redirect=//evil.com would be parsed by `new URL('//evil.com', base)`
// as a protocol-relative URL escaping the base origin → open redirect.
function safeRedirectPath(input: string | null): string {
  if (!input) return '/'
  // Reject protocol-relative (//evil.com), absolute URLs, and anything with
  // backslash-escapes. Only allow paths starting with a single forward slash.
  if (!input.startsWith('/') || input.startsWith('//') || input.startsWith('/\\')) return '/'
  return input
}

export async function GET(request: Request) {
  const expected = process.env.PREVIEW_CODE
  if (!expected) {
    // No code configured — fail closed rather than letting anyone in.
    return NextResponse.redirect(new URL('/coming-soon', request.url))
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = safeRedirectPath(searchParams.get('redirect'))

  if (code === expected) {
    const response = NextResponse.redirect(new URL(redirect, request.url))
    response.cookies.set('locateshoot_preview', 'true', {
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    })
    return response
  }

  return NextResponse.redirect(new URL('/coming-soon', request.url))
}