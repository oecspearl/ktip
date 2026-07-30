import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of the project form.
 *
 * One tour, two routes: /projects/new and /projects/:id/edit render the same
 * fields in the same order, so the copy is written to fit both rather than
 * duplicated and left to drift.
 */
export const projectFormTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="project-form"]',
    title: 'Publishing a project',
    description:
      'Title, summary and description are the whole of the required writing. The summary is the one line that shows on the home page and on cards, so it is worth more than its length suggests.\n\nAdditional Details underneath is optional — extra facts rendered as a list under your description.\n\nNothing here is permanent: everything on this form can be changed after publishing.',
    position: 'center',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="project-form-category"]',
    title: 'Category and phase',
    description:
      'These two are how people find you. Category is the sector filter on the Projects page; Phase says how far along you are — concept, prototype, funding or launch.\n\nBe honest about phase. Investors and mentors filter on it, and “concept” attracts a different, more useful kind of attention than “launch” does when you are not there yet.',
    position: 'right',
    secondaryTarget: '[data-tutorial="project-form-phase"]',
  },
  {
    target: '[data-tutorial="project-form-tags"]',
    title: 'Hashtags and climate action',
    description:
      'Up to ten hashtags. They drive the topic chips on the listing page and feed the Top Picks ranking, so pick words someone would actually search for.\n\nThe climate-action checkbox underneath is not decorative — it puts the project in the region’s resilience agenda, where funders and the OECS Commission look first.',
    position: 'right',
  },
  {
    target: '[data-tutorial="project-form-visibility"]',
    title: 'Public or not',
    description:
      'Public projects appear in the grid, in search, and to signed-out visitors. Leave it off and the project stays yours — useful while you are still writing it.\n\nYou can flip this later from the same form, so publishing is not a decision you have to get right now.',
    position: 'right',
  },
  replayStep,
]
