import * as Sentry from '@sentry/nextjs'

// Browser-side Sentry. Runs after the HTML document loads and before
// React hydrates, which is exactly when we want error tracking armed —
// any failure during hydration or first paint gets captured.
//
// `enabled` gates dev events out so local console errors don't pollute
// the Sentry dashboard or eat the free-tier quota. Flip NODE_ENV (or
// override `enabled`) if you ever want to verify dev wiring.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  // 10% of transactions get traced for performance. Errors are always
  // captured regardless of this rate.
  tracesSampleRate: 0.1,
  // Session replay disabled for now — heavier feature with separate
  // quota. Turn on later if needed by setting a non-zero rate here.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
})

// Per Next 16 instrumentation-client docs: exporting this lets Sentry
// add navigation breadcrumbs to events so you can see what route the
// user was on (and how they got there) when an error fired.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
