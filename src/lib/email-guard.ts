// Disposable / throwaway email domains to block at signup
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.biz',
  'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
  'tempmail.com', 'temp-mail.org', 'tempmail.net', 'tempr.email',
  '10minutemail.com', '10minutemail.net', '10minutemail.org',
  'throwam.com', 'throwaway.email', 'dispostable.com', 'mailnull.com',
  'yopmail.com', 'yopmail.fr', 'spam4.me', 'trashmail.com',
  'trashmail.me', 'trashmail.net', 'trashmail.io', 'trashmail.at',
  'fakeinbox.com', 'fakeinbox.net', 'sharklasers.com', 'guerrillamailblock.com',
  'grr.la', 'spam.la', 'discard.email', 'maildrop.cc',
  'mailnesia.com', 'mailnull.com', 'spamgourmet.com', 'spamgourmet.net',
  'spamgourmet.org', 'spamgourmet.com', 'getnada.com', 'filzmail.com',
  'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org', 'crazymailing.com',
  'moakt.com', 'mohmal.com', 'spamex.com', 'tempemail.com',
])

// Normalize a Gmail address: strip dots and +aliases from the local part.
// Gmail treats a.b.c@gmail.com and abc@gmail.com as the same inbox.
export function normalizeGmail(email: string): string {
  const lower = email.toLowerCase().trim()
  const [local, domain] = lower.split('@')
  if (!domain || (domain !== 'gmail.com' && domain !== 'googlemail.com')) return lower
  const normalized = local.replace(/\./g, '').split('+')[0]
  return `${normalized}@gmail.com`
}

export interface EmailGuardResult {
  blocked: boolean
  reason: string
}

export function checkEmail(email: string): EmailGuardResult {
  const lower = email.toLowerCase().trim()
  const atIdx = lower.lastIndexOf('@')
  if (atIdx < 1) return { blocked: true, reason: 'Invalid email address.' }

  const local  = lower.slice(0, atIdx)
  const domain = lower.slice(atIdx + 1)

  // 1. Disposable domain check
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { blocked: true, reason: 'Disposable email addresses are not allowed. Please use a real email.' }
  }

  // 2. Gmail suspicious dot pattern: 3+ dots in a short local part is a bot fingerprint
  //    e.g. u.q.a.x.i.qe4.56@gmail.com
  if ((domain === 'gmail.com' || domain === 'googlemail.com')) {
    const dots = (local.match(/\./g) ?? []).length
    if (dots >= 3 && local.length <= 20) {
      return { blocked: true, reason: 'This email address looks invalid. Please use your real Gmail address.' }
    }
  }

  return { blocked: false, reason: '' }
}
