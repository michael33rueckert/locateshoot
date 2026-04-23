'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Sitewide footer. Hidden on the client-facing /pick/* share pages (those are
// for the photographer's clients, not for LocateShoot users) and on the full-
// screen map / share screens where a footer would never be reached below
// overflow-hidden content.

// Home ("/") has its own dedicated marketing footer, so we skip the compact
// one there to avoid two footers stacking.
const HIDE_FOOTER_PREFIXES = ['/pick', '/explore', '/share']
const HIDE_FOOTER_EXACT = ['/']

export default function SiteFooter() {
  const pathname = usePathname() ?? ''
  if (HIDE_FOOTER_EXACT.includes(pathname)) return null
  if (HIDE_FOOTER_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return null

  const year = new Date().getFullYear()

  return (
    <footer style={{
      marginTop: 'auto',
      padding: '1.5rem 1.5rem calc(env(safe-area-inset-bottom, 0) + 1.5rem)',
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
          <Link href="/onboarding/how-it-works" style={{ color: 'var(--gold)', textDecoration: 'none', fontWeight: 500 }}>
            Getting Started
          </Link>
        </div>
      </div>
    </footer>
  )
}
