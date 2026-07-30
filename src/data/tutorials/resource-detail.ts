import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of a single resource page. */
export const resourceDetailTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Overview"]',
    title: 'The resource',
    description:
      'A guide, article, case study or tool published for the KTIP community, with its type and topic tags.\n\nThe column on the right carries the details, the author, and links to related resources when there are any.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Content"]',
    title: 'Reading it',
    description:
      'Text resources are readable in full on this page — no download needed.\n\nWhere the resource is a file, a template or an external tool, the download block underneath is what you want instead.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
