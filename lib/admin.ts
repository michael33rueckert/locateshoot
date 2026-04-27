// Admin email is read from NEXT_PUBLIC_ADMIN_EMAIL so the same value
// is available to both the client (the /admin page guard) and server
// (the /api/admin/* and /api/scan-locations route guards). Making it
// PUBLIC is fine — security comes from "you must be signed in as
// that user", not from secrecy of the email itself. Supabase auth
// won't let two accounts share an email, and the server verifies
// `auth.getUser()` returns a user whose email matches before granting
// admin access.
//
// If unset, every admin check fails closed.
//
// Set NEXT_PUBLIC_ADMIN_EMAIL in .env.local + Vercel production.
function getAdminEmail(): string | null {
  const v = process.env.NEXT_PUBLIC_ADMIN_EMAIL
  return v ? v.toLowerCase() : null
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const expected = getAdminEmail()
  if (!expected) return false
  return (email ?? '').toLowerCase() === expected
}
