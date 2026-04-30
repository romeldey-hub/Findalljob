const ADMIN_EMAILS = new Set(['romeldey@gmail.com'])

export function isAdminUser(email: string | null | undefined, role: string | null | undefined): boolean {
  return role === 'admin' || ADMIN_EMAILS.has(email ?? '')
}

export function isProUser(
  email: string | null | undefined,
  role: string | null | undefined,
  subscriptionStatus: string | null | undefined,
): boolean {
  return subscriptionStatus === 'pro' || isAdminUser(email, role)
}
