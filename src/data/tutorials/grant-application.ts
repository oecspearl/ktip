import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of the grant application wizard.
 *
 * The Review step only exists once you reach it, so the last content step is
 * written to be understood from step one and skipped harmlessly if the engine
 * cannot find it.
 */
export const grantApplicationTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Steps"]',
    title: 'A form in stages',
    description:
      'The application is split into steps, and this bar is both the progress indicator and the navigation — click any step you have reached to jump back to it.\n\nYour place is remembered: leave halfway through and you return to the step you were on.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Form"]',
    title: 'One step at a time',
    description:
      'Only the current step’s questions show, and required fields are validated when you move on — so you find out about a missing answer immediately rather than at submission.\n\nEverything saves as a draft as you go. Save draft is also there explicitly when you want to be sure before closing the tab.\n\nSome grants ask for documents; those upload here and stay attached to the draft.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Review"]',
    title: 'Review, then submit',
    description:
      'The last step shows the whole application back to you as the funder will see it, with an AI review panel that flags thin or missing answers before a human reads it.\n\nSubmitting validates every step, not just this one — if something earlier is incomplete you are taken back to it. Students also nominate a sponsor here.\n\nAfter submitting, the application appears under My Applications with its status.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
