import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of a single forum board. */
export const forumBoardTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="board-toolbar"]',
    title: 'Find a thread, or start one',
    description:
      'The search box filters this board’s discussions as you type — titles and bodies both.\n\nNew Discussion opens the editor. A discussion takes a title, a body with formatting, and lands in this board; you can edit yours afterwards.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="board-posts"]',
    title: 'The thread list',
    description:
      'Each row shows the author, when it was started and how many replies it has drawn. Pinned announcements sit at the top regardless of age.\n\nOpen a discussion to read it in full and reply. Moderators can pin, lock or remove threads here — if one disappears, that is why.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
