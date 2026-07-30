import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of the public /projects listing.
 *
 * Targets the page's existing `data-spy` section markers rather than new
 * anchors — those already wrap exactly the regions a step wants to frame, and
 * the scrollspy rail keeps them honest.
 */
export const projectsTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Top"]',
    title: 'The project archive',
    description:
      'Every innovation project published on KTIP — ideas at concept stage, ventures already trading, and everything between.\n\nProjects are public, so this page reads the same whether or not you are signed in. What changes once you sign in is that you can create your own and join someone else’s.',
    position: 'center',
  },
  {
    target: '[data-spy="Filters"]',
    title: 'One bar, every filter',
    description:
      'Everything here narrows the grid below, and the filters stack.\n\n• Category — agriculture, tourism, health, energy and the rest\n• Phase — concept, prototype, pilot, scaling\n• Search — click the magnifier, then type a title or keyword\n• Sort — newest, or Top Picks once you have set interests in your profile\n• The grid icon changes how many columns the cards sit in\n\nThe count in the middle updates as you go, and a Clear all filters link appears underneath once anything is active.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Projects"]',
    title: 'Reading the grid',
    description:
      'Each card carries the project’s title, summary, category and phase, plus the team behind it.\n\nWhen your results span more than one category the grid splits into folding sections — collapse the ones you are not interested in to get them out of the way. Pick a single category in the filter bar and it collapses back to one flat grid.\n\nClick any card for the full project: its story, team, updates, and how to ask to join.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="projects-create"]',
    title: 'Publish your own',
    description:
      'Create Project opens a short form — title, summary, category, phase and hashtags — and puts your work in this grid.\n\nYou can edit or unpublish it afterwards, so nothing here is one-way. Signed out, this button sends you to login first.',
    position: 'bottom',
  },
  replayStep,
]
