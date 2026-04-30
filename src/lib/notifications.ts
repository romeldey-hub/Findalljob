import { createClient } from '@/lib/supabase/server'

export type NotificationType = 'resume' | 'application' | 'jobs' | 'system'

interface NotificationPayload {
  userId: string
  type: NotificationType
  title: string
  body?: string
  ctaLabel?: string
  ctaHref?: string
}

export async function createNotification(payload: NotificationPayload): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('notifications').insert({
      user_id: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? '',
      cta_label: payload.ctaLabel ?? null,
      cta_href: payload.ctaHref ?? null,
    })
  } catch {
    // Notifications are non-critical — never let a failure block the main flow
  }
}
