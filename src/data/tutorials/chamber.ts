import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of business verification, on the Verification tab.
 *
 * Once a submission exists the form is replaced by a status card, so the form
 * anchor disappears and the tour is skipped down to the replay step — which is
 * the right behaviour: there is nothing left to explain but the status, and the
 * card says it in full. An individual account has no business section, so the
 * same happens for them.
 *
 * The file and the tour id keep the old "chamber" name: completion is stored
 * against the id.
 */
export const chamberTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="business-verification-form"]',
    title: 'Getting your business verified',
    description:
      'This goes to the business association for the member state you pick, and they check it against the national company registry.\n\nThe legal name and registration number have to match the registry. The trading name people know you by goes in its own field.\n\nGet the member state right first: it decides which association reviews you, and you can’t change it later.',
    position: 'center',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="business-verification-form"]',
    title: 'After you submit',
    description:
      'The form is replaced by a status card showing what you sent and where it stands: waiting, verified or not accepted.\n\nYou can’t edit the details after you submit, so a verified badge never sits on details nobody checked. To correct something, contact your business association.\n\nOnce verified, the badge shows on your business page, on your own profile and in the directory.',
    position: 'center',
  },
  replayStep,
]

/** The association's own queue at /association/review. */
export const associationReviewTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="association-queue"]',
    title: 'Businesses waiting in your country',
    description:
      'These are the businesses that asked your association to verify them. You only see the countries your association covers.\n\nWaiting shows how many days each one has been in the queue, so start with the oldest.',
    position: 'center',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="association-queue"]',
    title: 'Verifying',
    description:
      'Open Review and check the legal name and registration number against the national company registry. That check is what the badge means.\n\nVerify marks the business and its owner verified. Do not accept sends the owner your note, so say what to fix. Businesses can’t edit a submission, so a correction means they submit again.',
    position: 'center',
  },
  replayStep,
]
