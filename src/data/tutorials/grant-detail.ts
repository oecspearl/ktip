import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of a single grant page. */
export const grantDetailTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Key details"]',
    title: 'What is on offer',
    description:
      'The amount, the funder, the deadline and the grant type, all in one block.\n\nIf the deadline has passed the page stays up and says so — closed grants are worth reading, because most funders run the same call again.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="grant-apply"]',
    title: 'Applying',
    description:
      'Some grants are applied for here, some send you to the funder’s own site — this panel shows whichever applies.\n\nWhen it is an in-app application, it saves as a draft the moment you start, so the button turns into Continue Application if you leave and come back. Once submitted you can follow it under My Applications.\n\nIf you are not eligible, the panel says why rather than letting you fill in a form that would be rejected.',
    position: 'left',
  },
  {
    target: '[data-spy="Eligibility"]',
    title: 'Read this before you start',
    description:
      'Who the funder will accept — country, sector, stage, sometimes an age or institution requirement.\n\nAbove it sits the full brief and the detail block; below it, any documents the funder has published. The rail on the right jumps between all of them.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
