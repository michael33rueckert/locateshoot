import * as Sentry from '@sentry/nextjs'

// Edge runtime — middleware and any route handlers that opt into
// `runtime = 'edge'`. Lighter SDK surface than the Node init since
// Edge doesn't expose all Node APIs Sentry would otherwise instrument.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
})
