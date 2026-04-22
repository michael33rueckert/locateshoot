export const ADMIN_EMAIL = 'michael@locateshoot.com'

export function isAdminEmail(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase() === ADMIN_EMAIL
}
