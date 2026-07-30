import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of a single forum post. */
export const forumPostTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Post"]',
    title: 'The post',
    description:
      'The original message, its author and when it was written. If the author has edited it since, that is noted here rather than hidden.\n\nYour own posts carry edit and delete controls; moderators can act on anyone’s.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Replies"]',
    title: 'Replies',
    description:
      'Everything that follows, oldest first, so the thread reads top to bottom.\n\nThe box at the bottom is where you add yours — it posts immediately and notifies the thread’s author. You can delete your own reply afterwards; it disappears from the thread rather than leaving a stub.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
