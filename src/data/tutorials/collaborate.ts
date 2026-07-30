import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of the /collaborate hub. */
export const collaborateTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Top"]',
    title: 'Four tools, one account',
    description:
      'Real-time working surfaces you can open on their own or share with a team.\n\nEverything you make here saves to your account and appears in that tool’s list next time — nothing lives only in a browser tab.',
    position: 'center',
  },
  {
    target: '[data-tutorial="collaborate-tools"]',
    title: 'What each one is for',
    description:
      '• Whiteboard — visual brainstorming on an infinite canvas, several people drawing at once\n• Document Editor — rich-text documents with live co-editing\n• Code Sandbox — write, run and share snippets in six languages\n• Video Conference — face-to-face calls, no external account needed\n\nEach tile opens that tool’s list, where you pick up something you already started or begin a new one. Sharing is per item: you choose who can view and who can edit.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
