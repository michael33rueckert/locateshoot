import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  /* config options here */
};

// withSentryConfig wraps the Next config to:
//   - upload source maps to Sentry on every production build (via the
//     bundled @sentry/cli, authed by SENTRY_AUTH_TOKEN), so stack
//     traces in the dashboard map back to original TS instead of
//     minified JS.
//   - tunnel client errors through /monitoring so ad-blockers that
//     nuke direct sentry.io requests don't drop our events.
//
// All options are no-ops at runtime; they only kick in during `next
// build`. If SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT aren't
// set, source-map upload silently skips — the rest of the build still
// succeeds, and runtime error capture works regardless.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
})
