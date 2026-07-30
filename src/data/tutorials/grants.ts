import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of the public /grants listing. */
export const grantsTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Top"]',
    title: 'Funding for the region',
    description:
      'Startup funding, research grants, innovation awards, development funds and education grants — everything currently open to OECS innovators, plus the ones that have already closed.\n\nA grant is “closed” once its deadline passes or the funder marks it inactive. Closed grants stay on the page, folded away at the bottom, so you can see what tends to come round again.',
    position: 'center',
  },
  {
    target: '[data-spy="Filters"]',
    title: 'Narrowing it down',
    description:
      'The filters stack, so combine as many as you need.\n\n• Grant type — startup, research, innovation, development, education\n• Topic tags — drawn from the grants currently listed\n• Search — click the magnifier, then type a funder, title or keyword\n• Sort — by deadline (soonest first), newest, or Top Picks once your profile carries interests\n\nThe count tells you how many are open versus closed, and Clear all filters resets everything.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Grants"]',
    title: 'Reading a grant card',
    description:
      'Each card shows the funder, the amount on offer, the deadline and who is eligible.\n\nWhen your results span several grant types the list splits into folding sections. Closed grants sit in their own folded section at the very bottom.\n\nOpen any card for the full brief — eligibility, what the funder expects, and the Apply button that starts an application.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="grants-applications"]',
    title: 'Tracking what you sent',
    description:
      'My Applications is where every grant you have applied for lives — draft, submitted, under review or decided, with the date on each.\n\nApplications save as you go, so you can start one, leave, and come back to it.',
    position: 'bottom',
  },
  replayStep,
]
