import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of the CV editor.
 *
 * The idea worth explaining is ownership: a section you touch is marked as
 * yours and the Virtual Campus sync stops overwriting it. Nothing on screen
 * says that on its own.
 */
export const cvEditTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="cv-edit-prefill"]',
    title: 'Start from what you already have',
    description:
      'This fills empty fields from your KTIP record — profile, public projects, badges, institution. It never overwrites something you have written.\n\nIt does reload the document, so it asks you to save first if you have unsaved edits. Press it on a blank CV, or straight after saving.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="cv-edit-sections"]',
    title: 'Sections',
    description:
      'Experience, education, skills and languages each have an Add button, and entries can be removed.\n\nCourses are shown but not editable — they are the Virtual Campus’s record of what you completed, and a CV field an employer could quietly rewrite would be worth nothing. Delete an entry and it stays deleted.\n\nLeave a section empty and it simply does not appear on the printed CV.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="cv-edit-save"]',
    title: 'Saving, and what it means',
    description:
      'Nothing is stored until you save. The note beside the button counts the sections you have touched.\n\nThat count matters: a section you have edited is marked as yours, and syncing from the Virtual Campus afterwards leaves it alone. Untouched sections stay in sync with your course record.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
