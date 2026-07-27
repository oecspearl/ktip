import { supabase } from './supabase'

/**
 * Fire-and-forget notification via the send_notification RPC
 * (SECURITY DEFINER — direct inserts into `notifications` are no
 * longer allowed by RLS; the recipient's notification_preferences
 * are enforced by a DB trigger).
 */
export function sendNotification(params: {
  userId: string
  type: string
  title: string
  body?: string
  link?: string
}): void {
  void (supabase as any)
    .rpc('send_notification', {
      p_user_id: params.userId,
      p_type: params.type,
      p_title: params.title,
      p_body: params.body ?? null,
      p_link: params.link ?? null,
    })
    .then(
      () => {},
      () => {}
    )
}
