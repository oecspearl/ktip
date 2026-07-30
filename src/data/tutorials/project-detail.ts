import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of a single project page. */
export const projectDetailTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Overview"]',
    title: 'The project',
    description:
      'Its summary, category and phase — concept, prototype, pilot or scaling — with the hashtags the team chose.\n\nThe column on the right carries the owner, the team, and a block of key facts, plus other recent projects if this one is not what you were after.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="project-engagement"]',
    title: 'Backing it, or joining it',
    description:
      'Like signals support. Follow puts the project’s updates in front of you without you having to come back and check.\n\nShare copies a link anyone can open. Request to collaborate sends the owner a note asking to join the team — once sent it shows as pending here until they answer, and you cannot send a second one.\n\nThe view and team counts beside them are live.',
    position: 'top',
  },
  {
    target: '[data-spy="Documents"]',
    title: 'Documents',
    description:
      'Files the team has attached — a pitch deck, a technical brief, a budget.\n\nAnyone can read what is here. Uploading and removing is limited to the owner and editors, so a public project cannot be edited by the people browsing it.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Discussion"]',
    title: 'Discussion',
    description:
      'Questions and comments, in the open, attached to the project rather than to a forum thread that drifts away from it.\n\nThe team is notified when you post, so this is a reasonable place to ask before sending a collaboration request.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
