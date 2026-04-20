import { NextResponse } from 'next/server'

// The secret code you visit the site with to unlock it
// e.g. locateshoot.com/api/preview?code=sydney2024
const PREVIEW_CODE = 'sydney2024'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') ?? '/'

  if (code === PREVIEW_CODE) {
    const response = NextResponse.redirect(new URL(redirect, request.url))
    // Set cookie that lasts 30 days
    response.cookies.set('locateshoot_preview', 'true', {
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    })
    return response
  }

  // Wrong code — redirect to coming soon
  return NextResponse.redirect(new URL('/coming-soon', request.url))
}