// Password policy shared between the sign-up form and the Profile
// password-change form. Mirrors what's configured in Supabase Auth →
// Providers → Email → Password Requirements. If those settings ever
// change, update the constants here so client-side hints match what
// the server will accept.

export const PASSWORD_MIN_LENGTH = 8

export interface PasswordChecks {
  length: boolean
  lower:  boolean
  upper:  boolean
  digit:  boolean
  symbol: boolean
}

export interface PasswordValidation {
  ok:     boolean
  checks: PasswordChecks
}

// Symbol = any non-alphanumeric printable character. Kept intentionally
// permissive to match Supabase's own "lowercase, uppercase, digits and
// symbols" policy — it accepts anything that isn't a letter or digit.
const SYMBOL_RE = /[^A-Za-z0-9]/

export function validatePassword(pw: string): PasswordValidation {
  const checks: PasswordChecks = {
    length: pw.length >= PASSWORD_MIN_LENGTH,
    lower:  /[a-z]/.test(pw),
    upper:  /[A-Z]/.test(pw),
    digit:  /[0-9]/.test(pw),
    symbol: SYMBOL_RE.test(pw),
  }
  return {
    ok: checks.length && checks.lower && checks.upper && checks.digit && checks.symbol,
    checks,
  }
}

// One-line human summary of the policy — for placeholders, tooltips,
// help copy, etc.
export const PASSWORD_HINT_TEXT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with lowercase, uppercase, a number, and a symbol.`
