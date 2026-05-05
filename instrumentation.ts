import * as Sentry from '@sentry/nextjs'

// Next 16 instrumentation hook. Runs once when each runtime spins up
// (Node.js for the main server, Edge for middleware / edge routes).
// Sentry's init lives in runtime-specific files we re-import here so
// each runtime only pulls in its own bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Wired through Sentry so unhandled errors in Server Components, Route
// Handlers, and Server Actions all land in the dashboard with the same
// stack-trace + request context shape as client errors.
export const onRequestError = Sentry.captureRequestError
