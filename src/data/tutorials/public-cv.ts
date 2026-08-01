import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of a published CV (/user/:id/cv).
 *
 * Deliberately short. This page is usually opened by someone outside KTIP —
 * an employer following a link — so the tour explains the two controls and
 * gets out of the way.
 */
export const publicCvTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="public-cv-actions"]',
    title: 'A published CV',
    description:
      'This member chose to make their CV public, so the link opens for anyone — no KTIP account needed.\n\nDownload gives you the A4 PDF in black and white or colour. Read as text drops the page layout, which is easier on a phone or with a screen reader. View profile goes to the rest of their KTIP presence.',
    position: 'bottom',
    scrollMode: 'top',
  },
  replayStep,
]
