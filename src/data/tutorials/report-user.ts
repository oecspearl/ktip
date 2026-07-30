import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of the report form.
 *
 * Written plainly: someone on this page is already having a bad time, and the
 * two things they need to know are what happens to the report and who reads it.
 */
export const reportUserTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="report-form"]',
    title: 'Reporting a member',
    description:
      'This goes to the OECS safety team, not to the person you are reporting. They are not told who filed it.\n\nPick the category that fits best, then describe what happened — what was said or done, when, and anything that helps someone who was not there understand it. Twenty characters is the minimum; more is genuinely better.\n\nThe two optional fields matter more than “optional” suggests: a link to the post or screenshot, and where on the platform it happened, are what let the team find the evidence themselves.',
    position: 'center',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="report-form"]',
    title: 'After you submit',
    description:
      'You are asked to confirm before it sends — reports are taken seriously and cannot be withdrawn once filed.\n\nEvery report you have made is listed under My Reports, with its status as the team works through it. You will not always be told the outcome; some of it is about the other person’s account and is not ours to share.',
    position: 'center',
  },
  replayStep,
]
