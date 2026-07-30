import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of SME chamber verification.
 *
 * Once a submission exists the form is replaced by a status card, so the form
 * anchor disappears and the tour is skipped down to the replay step — which is
 * the right behaviour: there is nothing left to explain but the status, and the
 * card says it in full.
 */
export const chamberTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="chamber-form"]',
    title: 'Getting your business verified',
    description:
      'This goes to the Chamber of Commerce for the member state you pick, and they check it against the national corporate registry.\n\nThe legal name and registration number have to match what is on that registry — the trading name people know you by goes in its own field.\n\nMember state is the one field to get right first: it decides which Chamber reviews you and it cannot be changed afterwards.',
    position: 'center',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="chamber-form"]',
    title: 'After you submit',
    description:
      'The form is replaced by a status card — pending, verified or rejected — showing what you sent.\n\nDetails cannot be edited after submission: a record that could change after review would end up carrying a verified badge over unchecked data. Corrections go through your Chamber directly.\n\nOnce verified, the badge shows on your profile and in the directory.',
    position: 'center',
  },
  replayStep,
]
