// Plan-tier helpers. profiles.plan is one of 'free' | 'starter' | 'pro'
// (case-insensitive — historic data may have 'Pro' from the original
// admin-set values, so we normalize). Two convenience predicates cover
// every gate in the app:
//
//   hasStarter(plan): true for 'starter' and 'pro' — features bundled
//     into the entry paid tier (unlimited guides + locations, permit
//     info on share pages, client confirmation email, share analytics,
//     Pinterest/blog links).
//
//   hasPro(plan): true only for 'pro' — features that justify the
//     higher-tier price (custom domain, white-label, customizable Pick
//     page templates, custom sending email when re-enabled).

export type Plan = 'free' | 'starter' | 'pro'

const FREE_PORTFOLIO_LOCATION_CAP = 5

export function normalizePlan(plan: string | null | undefined): Plan {
  const p = (plan ?? '').toLowerCase().trim()
  if (p === 'pro')     return 'pro'
  if (p === 'starter') return 'starter'
  return 'free'
}

export function hasStarter(plan: string | null | undefined): boolean {
  const p = normalizePlan(plan)
  return p === 'starter' || p === 'pro'
}

export function hasPro(plan: string | null | undefined): boolean {
  return normalizePlan(plan) === 'pro'
}

export function freePortfolioLocationCap(): number {
  return FREE_PORTFOLIO_LOCATION_CAP
}
