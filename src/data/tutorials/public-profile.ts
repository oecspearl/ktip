import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of a member page (/u/:id).
 *
 * Public on purpose — a profile you can only open when signed in is not one you
 * can share — so the copy assumes the reader may be a visitor, not a member.
 */
export const publicProfileTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Profile"]',
    title: 'A member page',
    description:
      'Name, roles, country and a short bio, with the buttons to act on it: Connect sends a request, Message opens a conversation once you are connected.\n\nThis page is public, so the link works for anyone you send it to — including someone without a KTIP account.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Standing"]',
    title: 'Standing',
    description:
      'Points earned from activity on the platform and the rank that follows from them, plus verification status.\n\nA verified badge means an OECS admin has confirmed the member is who they say they are — worth checking before you take a funding conversation forward.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="About"]',
    title: 'The rest of the profile',
    description:
      'Skills, interests, what they are open to collaborating on, and below that their projects, events and achievements.\n\nMembers control how much of this is public from their own settings, so a sparse page is a choice rather than an empty account.',
    position: 'top',
    scrollMode: 'top',
  },
  replayStep,
]
