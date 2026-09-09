import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of the My Profile tab.
 *
 * Was the tour of /settings, which no longer exists — its panels are dashboard
 * tabs now and the profile form is this preview. The two steps worth keeping
 * from it were never really about Settings: what roles unlock, and that
 * interests are read by the ranker rather than being decoration. Both are told
 * here, against the blocks they actually describe.
 *
 * Every target is a `data-spy` marker the canvas emits. The Interests step is
 * skipped rather than stranding when a member has none and the section is not
 * on screen — which is also why the toolbar and the identity plate, the two
 * that are always there, carry the load.
 */
export const myProfileTutorialSteps: TutorialStep[] = [
  {
    target: '[data-spy="Privacy"]',
    title: 'This page is your profile',
    description:
      'What you see below is what other members see — not a form that describes it. Every block you can change has a pencil on it; click one and the preview updates as you type.\n\nLocking your profile leaves the teaser (name, photo, country) public and puts everything else behind an accepted connection request.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Profile"]',
    title: 'Roles decide what you see',
    description:
      'Your roles are what unlock the role-specific parts of KTIP — an investor gets the Funding tab on the dashboard, a mentor gets Mentees, faculty get Research.\n\nSome roles are self-selected and some are granted after verification, which is why a role you expect may not be here yet. Edit this block to choose the ones you can.',
    position: 'right',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Interests"]',
    title: 'Interests do real work',
    description:
      'Skills and interests are not only profile decoration — they are what the “Top Picks” and “For You” sorts rank against, on projects, events and grants.\n\nA profile with no interests gets the plain newest-first ordering everywhere. Filling this in is the single change that most affects what the platform shows you.',
    position: 'right',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="dashboard-tabs"]',
    title: 'The rest of your account',
    description:
      'Everything that used to live under Settings is on this rail, under Account: Security for your password, two-step verification and closing the account; Preferences for notifications and what the directory shows; Personalization for what feeds “For You”; Verification for student and identity checks.\n\nOld /settings links still work — they land on the matching tab.',
    position: 'right',
    scrollMode: 'top',
  },
  replayStep,
]
