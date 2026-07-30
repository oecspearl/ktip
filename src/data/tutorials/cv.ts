import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of /cv.
 *
 * The page's one non-obvious idea is that the thing on screen *is* the PDF —
 * there is no separate export step to go looking for. Step one says so.
 */
export const cvTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="cv-sheet"]',
    title: 'This is the PDF',
    description:
      'Not a preview of one — a true A4 sheet, scaled to fit the screen and printed at full size. What you see is exactly what an employer receives.\n\nIf the page is blank, no CV has been started yet: either sign in from the OECS Virtual Campus to pull in your course history, or write it yourself from Edit.',
    position: 'center',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="cv-actions"]',
    title: 'Download, edit, publish',
    description:
      '• Download B&W or Color — opens the print dialog; choose “Save as PDF”\n• Read as text — the same content without page geometry, easier on a phone\n• Sync from Virtual Campus — pulls in your OECS course history and leaves any section you have edited alone\n• Edit — opens the editor\n• Public / Private — a public CV gets a shareable link that opens for anyone, even signed out. Private is the default.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="cv-designs"]',
    title: 'Pick a design',
    description:
      'Each design is the same content in a different layout, and the choice sticks — the document, the download and your public link all use it.\n\nOne print note: Signature has a navy sidebar, so it needs “Background graphics” switched on in the print dialog. Classic and Compact print correctly either way.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
