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

/**
 * The two statuses that mean "this no longer needs attention".
 *
 * Resolved and dismissed are the two ways a report stops being work — one
 * because something was done, one because nothing will be. The triage list
 * folds both away behind a single disclosure, and the reason they are named
 * here rather than inlined is that the list, the counter and the collapse all
 * have to agree on what "completed" means.
 */
export const FEEDBACK_COMPLETED_STATUSES = ['resolved', 'dismissed'] as const

export function isFeedbackCompleted(status: string): boolean {
  return (FEEDBACK_COMPLETED_STATUSES as readonly string[]).includes(status)
}

/**
 * What to call a status on screen.
 *
 * A closed bug report reads **Fixed**; everything else keeps the generic
 * **Resolved**. Same stored value either way — the distinction is vocabulary,
 * not state, and adding a 'fixed' status would have split the filter for no
 * gain. One function so the row toggle, the badge and the modal's select
 * cannot drift apart on the wording.
 */
export function feedbackStatusLabel(status: string, category?: string | null): string {
  if (status === 'resolved' && category === 'bug') return 'Fixed'
  return FEEDBACK_STATUS_LABELS[status] ?? status
}

/**
 * Sort orders that mean something.
 *
 * Both maps exist because the obvious alternative — letting the database ORDER
 * BY the column — sorts these alphabetically, and alphabetically is wrong for
 * both: status would run dismissed → in_review → new → resolved, which is
 * backwards, and category would bury bugs under content and feature_request.
 * Unknown keys fall to the end rather than the front, so a value added to the
 * CHECK constraint before this map is updated is merely last, not mis-sorted.
 */
export const FEEDBACK_STATUS_RANK: Record<string, number> = {
  new: 0,
  in_review: 1,
  resolved: 2,
  dismissed: 3,
}

export const FEEDBACK_CATEGORY_RANK: Record<string, number> = {
  bug: 0,
  feature_request: 1,
  content: 2,
  general: 3,
  praise: 4,
}

export const FEEDBACK_RANK_FALLBACK = 99
