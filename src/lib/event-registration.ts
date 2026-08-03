import { supabase } from './supabase'
import { sendNotification } from './notify'
import { ATTENDANCE_TYPE_LABELS } from './constants'
import type { AttendanceType } from '../types'
import { msg } from '@lingui/core/macro'
// The runtime singleton (not the macro), so a title can be resolved right
// here — this is plain business logic, not a component render, so there is
// no `t` from useLingui() to close over.
import { i18n } from '@lingui/core'

/**
 * Telling the organizer someone registered.
 *
 * Registration has two entry points — the plain RSVP button (useRSVP) and the
 * custom-fields form (useSubmitRegistration) — and before this both of them
 * inserted a row and told nobody. Keeping the announcement here means a third
 * entry point cannot quietly skip it.
 *
 * Two channels, deliberately: the in-app notification is what surfaces the
 * request on /invitations, and the email is what reaches an organizer who is
 * not in the app. Both are fire-and-forget — a registration that succeeded must
 * not report failure because a mail server was down.
 */
export function announceRegistration(params: {
  eventId: string
  eventTitle: string
  organizerId: string
  registrantName: string
  attendanceType: AttendanceType
}): void {
  const how = (ATTENDANCE_TYPE_LABELS[params.attendanceType] || 'Participant').toLowerCase()

  sendNotification({
    userId: params.organizerId,
    type: 'event_registration_request',
    title: i18n._(msg`New registration to approve`),
    body: i18n._(msg`${params.registrantName} wants to attend "${params.eventTitle}" as a ${how}.`),
    link: '/invitations',
  })

  void emailOrganizer(params.eventId).catch(() => {})
}

/**
 * The email half. The organizer's address is never sent to or returned from the
 * browser — the endpoint resolves it server-side from the event, and all the
 * client gets to say is which registration it just made.
 */
async function emailOrganizer(eventId: string): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return

  await fetch('/api/events/registration-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ event_id: eventId }),
  })
}

/**
 * Telling the registrant what the organizer decided. Mirrors the
 * document_access_result notification in useDocumentAccess.
 */
export function announceRegistrationDecision(params: {
  registrantId: string
  eventId: string
  eventTitle: string
  approve: boolean
}): void {
  sendNotification({
    userId: params.registrantId,
    type: 'event_registration_result',
    title: params.approve
      ? i18n._(msg`Registration approved`)
      : i18n._(msg`Registration declined`),
    body: params.approve
      ? `You are registered for "${params.eventTitle}".`
      : `Your registration for "${params.eventTitle}" was not approved.`,
    link: `/events/${params.eventId}`,
  })
}
