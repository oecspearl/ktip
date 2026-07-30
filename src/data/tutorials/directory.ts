import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/** Guided tour of /directory. */
export const directoryTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Top"]',
    title: 'Everyone on the platform',
    description:
      'Innovators, mentors, investors, faculty, researchers and public-sector members from across the OECS.\n\nMembers who have opted out of the directory are not listed, and students are excluded by default — so what you see here is people who want to be found.',
    position: 'center',
  },
  {
    target: '[data-spy="Search"]',
    title: 'Five ways to narrow it',
    description:
      'Search by name, then stack any of the filters beside it:\n\n• Role — mentor, investor, faculty, SME, and the rest\n• Country — anywhere in the Caribbean\n• Skill — what someone actually works on\n• Badge — members who have earned a particular achievement\n\nClear all filters appears underneath once anything is set.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Members"]',
    title: 'Member cards',
    description:
      'Each card carries a member’s role, country, skills and connection count — unless they have chosen to hide it.\n\nClick a card and their profile slides in from the side without losing your place in the results. From there you can send a connection request or start a message. The Connect button is on the card itself when you want to skip the panel.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
