'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { supabase } from '@/lib/supabase'

// Attaches the signed-in user to every Sentry event so error reports
// can be filtered/grouped by photographer in the dashboard. Re-runs
// on every auth state change (sign-in, sign-out, refresh) so the scope
// stays in sync with the live session.
//
// Mounted once globally from app/layout.tsx — anywhere else would risk
// running multiple identical listeners.
export default function SentryUserScope() {
  useEffect(() => {
    function applySession(user: { id: string; email?: string | null } | null | undefined) {
      if (user?.id) {
        Sentry.setUser({ id: user.id, email: user.email ?? undefined })
      } else {
        Sentry.setUser(null)
      }
    }
    supabase.auth.getUser().then(({ data }) => applySession(data.user))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user ?? null)
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  return null
}
