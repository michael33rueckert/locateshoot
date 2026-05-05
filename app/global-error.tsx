'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Top-level error boundary that fires when an unhandled error escapes
// every other boundary (i.e. the root layout itself crashed). Without
// this file, root-render errors don't reach Sentry — they short-circuit
// React rendering before any nested boundary mounts.
//
// global-error.tsx must render its own <html>/<body> because the root
// layout has already failed and won't be rendered.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', textAlign: 'center', color: '#1a1612', background: '#f5f0e8' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: '#6b6356', marginBottom: 20 }}>The page hit an error and couldn&apos;t render. We&apos;ve been notified.</p>
        <a href="/" style={{ color: '#c4922a', textDecoration: 'underline', fontSize: 14 }}>Reload home</a>
      </body>
    </html>
  )
}
