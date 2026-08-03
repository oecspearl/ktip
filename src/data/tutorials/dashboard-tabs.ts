import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Tours for the dashboard's individual tabs.
 *
 * Every one of these targets `dashboard-panel` and `dashboard-tabs`, both of
 * which live in DashboardLayout — so a tab needs no markup of its own to be
 * tourable, and the shell is framed the same way on every tab.
 *
 * Two steps each: what this panel holds, then where the rest of it lives. The
 * shell itself is explained by the /dashboard tour.
 */

const railStep = (description: string): TutorialStep => ({
  target: '[data-tutorial="dashboard-tabs"]',
  title: 'The rest of your dashboard',
  description,
  position: 'right',
  scrollMode: 'top',
})

const panelStep = (title: string, description: string): TutorialStep => ({
  target: '[data-tutorial="dashboard-panel"]',
  title,
  description,
  position: 'left',
  scrollMode: 'top',
})

// The profile (My CV) tab has no tour here: it hosts the full CV page, whose
// own tour (see ./cv) runs on /dashboard/profile.

export const dashboardProgressTutorialSteps: TutorialStep[] = [
  panelStep(
    'Your activity timeline',
    'Everything you have done on KTIP in order — projects published, events organized, applications sent, achievements earned, connections made.\n\nIt is built from real records rather than a counter, so it doubles as a way to find something you did months ago and cannot otherwise place.'
  ),
  railStep(
    'Achievements turns the same activity into badges and points. Submissions keeps the copies of anything you sent.'
  ),
  replayStep,
]

export const dashboardAchievementsTutorialSteps: TutorialStep[] = [
  panelStep(
    'Badges and points',
    'Your earned badges, the ones still locked with what unlocks them, and the points that follow.\n\nThis is the same gallery as the standalone Achievements page, embedded so you keep the rail. Pinned badges show on your public profile — the pin controls are on each badge.'
  ),
  railStep(
    'Progress next door is the same story as a timeline. Points from here decide where you sit on the public leaderboard.'
  ),
  replayStep,
]

export const dashboardProjectsTutorialSteps: TutorialStep[] = [
  panelStep(
    'Projects you own',
    'Everything you have published, including anything still private — this tab is the only place a private project is visible.\n\nOpen one to edit it, manage its team, or answer collaboration requests. Projects you were added to by someone else are not here; they are on your profile.'
  ),
  railStep(
    'Events works the same way for anything you organize. Connections is the people side.'
  ),
  replayStep,
]

export const dashboardEventsTutorialSteps: TutorialStep[] = [
  panelStep(
    'Events you organize',
    'Events you created, upcoming and past. Open one to edit it, see who registered, post updates, or set up its virtual venue.\n\nEvents you merely registered for are not here — your copy of that registration is under Submissions.'
  ),
  railStep(
    'Submissions holds your registrations. Projects is the equivalent tab for work you have published.'
  ),
  replayStep,
]

export const dashboardConnectionsTutorialSteps: TutorialStep[] = [
  panelStep(
    'People you know',
    'Everyone whose connection request you accepted, or who accepted yours. Click a card to open their profile in the side panel without leaving this page.\n\nRemoving a connection is silent — the other member is not notified — and you can reconnect later.'
  ),
  railStep(
    'New requests waiting on you are under Invitations, not here. The member directory is where you find people to connect with in the first place.'
  ),
  replayStep,
]

export const dashboardSubmissionsTutorialSteps: TutorialStep[] = [
  panelStep(
    'Copies of everything you sent',
    'Grant applications, event registrations, forms — a record of each, as it was at the moment you submitted it.\n\nThese do not change when the event or the grant does, which is the point: if a deadline moves or a form is edited afterwards, your copy still shows what you actually sent.\n\nOpen one for the full receipt, with a reference number and a print-ready view.'
  ),
  railStep(
    'Grant applications also appear under My Applications, where you can see their review status. This tab is the paperwork; that page is the progress.'
  ),
  replayStep,
]
