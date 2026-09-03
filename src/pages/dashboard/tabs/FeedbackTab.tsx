import { usePageTitle } from '../../../hooks/usePageTitle'
import { useLingui } from '@lingui/react/macro'
import { FeedbackTab as FeedbackList } from '../../settings/FeedbackTab'

/**
 * Replies to the feedback you sent, on the rail rather than buried in Settings.
 *
 * The list itself is the Settings panel, unchanged and rendered here as-is:
 * it takes no props and reads the reporter's own rows through my_feedback(),
 * so the same component serves both mounts and an admin reply lands in both
 * places at once. Deliberately a re-mount rather than a move — /settings?tab=
 * feedback is the address stored in every notification sent by 127 (see
 * lib/feedback-reply.ts) and in mail already delivered, so it has to keep
 * working. This is a second door onto one room.
 */
export default function DashboardFeedbackTab() {
  const { t } = useLingui()
  usePageTitle(t`My Feedback`)

  return <FeedbackList />
}
