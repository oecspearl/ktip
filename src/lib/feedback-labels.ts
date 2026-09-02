/**
 * The vocabulary of the feedback channel, in one place.
 *
 * Split out of AdminFeedbackPage when Settings › Feedback started showing the
 * same status and category to the reporter. Importing them from the admin page
 * would have pulled that whole route — signed URLs, filter bar and all — into
 * every member's settings bundle for the sake of two string maps.
 *
 * Keys are the values the `feedback` CHECK constraints allow (037, widened by
 * 093). The colour maps are shared for the same reason: a status that looks
 * green to an admin and grey to the reporter is the same status described
 * twice.
 */

export const FEEDBACK_CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug Report',
  feature_request: 'Feature Request',
  general: 'General',
  content: 'Content',
  praise: 'Praise',
}

export const FEEDBACK_CATEGORY_COLORS: Record<string, string> = {
  bug: 'bg-red-100 text-red-700 border-red-200',
  feature_request: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  general: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  content: 'bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200',
  praise: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
}

export const FEEDBACK_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_review: 'In Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

export const FEEDBACK_STATUS_COLORS: Record<string, string> = {
  new: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  in_review: 'bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200',
  resolved: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  dismissed: 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200',
}
