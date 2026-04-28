import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`)
      // Set the preview-gate bypass cookie. A confirmed email = a real
      // account holder; otherwise the user just bounces to /coming-soon
      // when the redirect lands on /dashboard. Without this cookie,
      // every email-link click from a phone (which doesn't have the
      // desktop's preview cookie) would dead-end at the gate. Same
      // params as /api/preview so the cookies are interchangeable.
      response.cookies.set('locateshoot_preview', 'true', {
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      })
      return response
    }
  }

  // Something went wrong — redirect to home
  return NextResponse.redirect(`${origin}/`)
}
