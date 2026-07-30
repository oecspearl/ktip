import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of a submission receipt. */
export const submissionReceiptTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="receipt-document"]',
    title: 'Your copy of what you sent',
    description:
      'Every registration, application and form you submit on KTIP leaves one of these — the answers exactly as they were at the moment you sent them, with the date and a reference number.\n\nIt does not change afterwards. If the event is edited or the grant closes, this copy still says what you actually submitted.',
    position: 'center',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="receipt-actions"]',
    title: 'Print it, or go to the source',
    description:
      'Print / Save as PDF gives you a clean document — the page chrome is stripped from the print output.\n\nThe other button goes to whatever this was submitted to: the event, the grant, the form. Useful when you need the current state of the thing rather than your copy of it.',
    position: 'bottom',
  },
  replayStep,
]
