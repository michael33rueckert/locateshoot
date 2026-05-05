import * as Sentry from '@sentry/nextjs'

// Node.js runtime — covers Route Handlers, Server Components, Server
// Actions, and the rest of the Next.js server-side surface. Loaded
// from instrumentation.ts only when NEXT_RUNTIME === 'nodejs'.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
})
