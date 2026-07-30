import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Guided tour of /settings.
 *
 * The five tabs are local state rather than routes, and the tour deliberately
 * does not drive them: half of what is behind them (password, secondary email,
 * delete account) is not something a walkthrough should be clicking toward.
 * It describes them instead and leaves the clicking to the member.
 *
 * The two per-section steps target `data-spy` markers that only exist while the
 * Profile tab is showing — which it is by default. Arrive on `?tab=security`
 * and the engine skips them rather than stranding.
 */
export const settingsTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="settings-nav"]',
    title: 'Five groups of settings',
    description:
      '• Profile — your name, photo, bio, skills and what you are open to\n• Security — password, email address, and deleting your account\n• Preferences — notifications, privacy, accessibility and light/dark\n• Personalization — what feeds the “For You” ranking across the site\n• Verification — student status and identity checks\n\nThe tab is in the URL, so a link to a particular tab opens on it.',
    position: 'right',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Roles"]',
    title: 'Roles decide what you see',
    description:
      'Your roles are what unlock the role-specific parts of KTIP — an investor gets the Funding tab on the dashboard, a mentor gets Mentees, faculty get Research.\n\nSome roles are self-selected and some are granted after verification, which is why a role you expect may not be here yet.',
    position: 'left',
    scrollMode: 'top',
  },
  {
    target: '[data-spy="Interests"]',
    title: 'Interests do real work',
    description:
      'Skills and interests are not only profile decoration — they are what the “Top Picks” and “For You” sorts rank against, on projects, events and grants.\n\nA profile with no interests gets the plain newest-first ordering everywhere. Filling this in is the single change that most affects what the platform shows you.',
    position: 'left',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="settings-panel"]',
    title: 'Privacy and notifications',
    description:
      'Under Preferences: which emails KTIP sends you, whether your connection count is public, whether you appear in the member directory and on the leaderboard at all.\n\nUnder Security: password, a secondary email for recovery, and account deletion. Deletion is permanent and asks you to confirm in writing.',
    position: 'left',
    scrollMode: 'top',
  },
  replayStep,
]
