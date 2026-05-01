const ADMIN_EMAILS = new Set(['romeldey@gmail.com'])

export function isAdminUser(email: string | null | undefined, role: string | null | undefined): boolean {
  return role === 'admin' || ADMIN_EMAILS.has(email ?? '')
}

export function isProUser(
  email: string | null | undefined,
  role: string | null | undefined,
  _subscriptionStatus: string | null | undefined,
  proUntil?: string | null,
): boolean {
  if (isAdminUser(email, role)) return true
  // pro_until is the sole source of truth for Pro access
  if (proUntil != null) return new Date(proUntil) > new Date()
  return false
}
