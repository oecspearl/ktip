import { supabase } from './supabase'
import { sendNotification } from './notify'
import { msg } from '@lingui/core/macro'
// The runtime singleton, not the macro: this is plain business logic called
// from a handler, so there is no `t` from useLingui() to close over.
import { i18n } from '@lingui/core'

/** send_notification() rejects a body over 1000 characters, and a reply long
 *  enough to hit that is one the reporter should read in full on the page. */
const BODY_LIMIT = 900

/**
 * Telling someone their report was dealt with.
 *
 * Two channels, the same trade as announceRegistration(): the notification is
 * what shows up on the bell and survives in Settings › Feedback, the email is
 * what reaches a reporter who is not in the app — which is most of them, since
 * the whole point of a bug report is that they left.
 *
 * Both are fire-and-forget. The reply is already committed to the row by the
 * time this runs; a mail server being down must not make a saved reply look
 * like a failed one.
 */
export function announceFeedbackReply(params: {
  reporterId: string
  feedbackId: string
  subject: string
  reply: string
}): void {
  const preview =
    params.reply.length > BODY_LIMIT ? `${params.reply.slice(0, BODY_LIMIT).trimEnd()}…` : params.reply

  sendNotification({
    userId: params.reporterId,
    type: 'feedback_reply',
    title: i18n._(msg`We replied to your feedback`),
    body: preview,
    link: '/settings?tab=feedback',
  })

  void emailReporter(params.feedbackId).catch(() => {})
}

/**
 * The email half. The reporter's address is never sent to or returned from the
 * browser — the endpoint resolves it server-side from the feedback row, and all
 * the client gets to say is which report it just answered.
 */
async function emailReporter(feedbackId: string): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return

  await fetch('/api/feedback/reply-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ feedback_id: feedbackId }),
  })
}
