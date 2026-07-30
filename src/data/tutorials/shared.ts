import type { TutorialStep } from '../../components/tutorial/types'

/**
 * Closing card every tour ends on.
 *
 * The FAB is the only entry point a user can find on their own, and most tours
 * never auto-start — so the last thing a tour says is where to find it again.
 * `[data-fab]` is fixed-position, which the overlay's scroll logic already
 * special-cases.
 */
export const replayStep: TutorialStep = {
  target: '[data-fab]',
  title: 'Replay this any time',
  description:
    'Open the quick-actions button in the corner and choose Page tour to run this walkthrough again — here, or on any other page that has one.',
  position: 'left',
}
