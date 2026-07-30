import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of the new-post form. */
export const forumPostFormTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="post-form"]',
    title: 'Starting a discussion',
    description:
      'A title and a body, posted to the board you came from — the board is fixed by the page, so there is nothing to choose.\n\nWrite the title as the question you actually want answered; it is all most people see in the thread list.\n\nOnce published you can edit or delete your own post, and replies notify you as they arrive.',
    position: 'center',
    scrollMode: 'top',
  },
  replayStep,
]
