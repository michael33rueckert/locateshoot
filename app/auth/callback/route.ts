import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Supabase redirects users here after they click the confirmation link
// in their email (sign up confirmation or magic link login).
// We exchange the code for a session then send them to the dashboard.

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.exchangeCodeForSession(code)
  }

  // After confirming, send them to the dashboard
  return NextResponse.redirect(new URL('/dashboard', request.url))
}