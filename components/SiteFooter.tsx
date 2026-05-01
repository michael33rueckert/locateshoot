'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Compact footer shown on signed-in internal pages. Anonymous visitors see
// the dedicated marketing footer on / instead; client-facing /pick/* links
// don't show either. Full-screen working screens (explore) skip it too.

const HIDE_FOOTER_PREFIXES = ['/pick', '/explore']
const HIDE_FOOTER_EXACT = ['/']

export default function SiteFooter() {
  const pathname = usePathname() ?? ''
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session?.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s?.user))
    return () => subscription.unsubscribe()
  }, [])

  if (signedIn !== true) return null
  if (HIDE_FOOTER_EXACT.includes(pathname)) return null
  if (HIDE_FOOTER_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return null

  const year = new Date().getFullYear()

  return (
    <footer style={{
      marginTop: 'auto',
      padding: '1.25rem 1.5rem calc(env(safe-area-inset-bottom, 0) + 1.25rem)',
      borderTop: '1px solid var(--cream-dark)',
      background: 'var(--cream)',
    }}>
      <div style={{
        maxWidth: 1180,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        fontSize: 12,
        color: 'var(--ink-soft)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
          <span style={{ fontFamily: 'var(--font-playfair),serif', fontSize: 13, fontWeight: 900, color: 'var(--ink)' }}>LocateShoot</span>
          <span style={{ marginLeft: 6 }}>© {year}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <Link href="/onboarding/how-it-works" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>
            Getting Started
          </Link>
          <Link href="/help" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>
            Help
          </Link>
        </div>
      </div>
    </footer>
  )
}
