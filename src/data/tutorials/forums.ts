import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of /forums.
 *
 * Short on purpose — the page is one grid of boards. Everything about posting,
 * replying and moderation belongs to the board and post tours, where the
 * controls actually are.
 */
export const forumsTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Top"]',
    title: 'Where the conversation happens',
    description:
      'Forums are the long-form side of KTIP — questions, announcements, calls for collaborators, and the discussions that do not fit in a comment on a project.\n\nAnyone can read. Posting and replying need an account.',
    position: 'center',
  },
  {
    target: '[data-tutorial="forums-boards"]',
    title: 'Boards',
    description:
      'Each tile is a board with its own topic. The tile shows how many discussions it holds and when it was last active, so you can tell a busy board from a quiet one at a glance.\n\nOpen a board to see its posts — newest first, pinned announcements on top — and to start a discussion of your own.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
