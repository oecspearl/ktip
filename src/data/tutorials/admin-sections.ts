import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Tours for the individual admin sections.
 *
 * Every one targets `admin-content` — the Outlet wrapper in AdminLayout — twice:
 * what the section is for, then what the controls on it actually do. Two things
 * make that the right shape rather than a shortcut:
 *
 *  - The 21 admin pages are hand-rolled and share no table or toolbar component,
 *    so there is no per-page anchor worth adding 21 times.
 *  - No step here drives a click. An admin walkthrough that pressed a real
 *    verify, publish or delete control would be changing records to explain
 *    itself. Every one of these frames the control and lets the operator press it.
 *
 * The rail is explained once by the /admin tour, not repeated on every section.
 */

const section = (title: string, description: string, position: 'top' | 'left' = 'top'): TutorialStep => ({
  target: '[data-tutorial="admin-content"]',
  title,
  description,
  position,
  scrollMode: 'top',
})

export const adminProjectsTutorialSteps: TutorialStep[] = [
  section(
    'Projects, from the platform side',
    'Every project members have published, private ones included. Search and filter the same way the public page does, then act on a row.'
  ),
  section(
    'Featuring is the main lever',
    'Toggling featured is what puts a project in the home page hero rotation — it is the strongest editorial signal KTIP has, so it is worth spending sparingly.\n\nRemoving a project here removes it for its owner too. Prefer talking to them first; a project that breaks the rules is a moderation matter rather than an editorial one.'
  ),
  replayStep,
]

export const adminEventsTutorialSteps: TutorialStep[] = [
  section(
    'Every event on the platform',
    'Published and draft, upcoming and past. Draft events are visible only to administrators, which is how an event is prepared before anyone can see it.'
  ),
  section(
    'Open one to run it',
    'A row opens that event’s admin page, where the real work is: registrations and their answers, the schedule, speakers, articles, updates, the challenge brief, the virtual venue, and the registration form builder.\n\nCancelling an event keeps its page up with a cancelled badge rather than deleting it — people who registered still need to find out what happened.'
  ),
  replayStep,
]

export const adminEventDetailTutorialSteps: TutorialStep[] = [
  section(
    'One event, every tab',
    'Registrations lists who is coming and what they answered, exportable. Schedule and Speakers build the agenda shown on the public page. Updates posts announcements to everyone registered.\n\nChallenge sets the objectives, constraints, deliverables and judging criteria for a challenge event. Venue creates the rooms attendees walk between — there is a one-click starter set.'
  ),
  section(
    'The builders',
    'Form Builder decides what a registrant is asked beyond their name — add a field and it appears on the public page immediately, so changing it mid-registration means some answers exist and some do not.\n\nPage Builder is the event’s own landing content. Both save as you go.'
  ),
  replayStep,
]

export const adminUsersTutorialSteps: TutorialStep[] = [
  section(
    'Accounts',
    'Every registered member, filterable by role and verification status. The count is in the banner.\n\nCreate User makes an account directly — used for staff and for members who cannot self-register.'
  ),
  section(
    'Row actions, and what they mean to the member',
    'Edit roles changes what the member can reach; Roles & Permissions is where those roles are defined.\n\nReset password sends them a reset — it does not show you anything. Verify marks the account as identity-checked, which shows publicly as a badge; unverify removes it.\n\nDelete is permanent and takes their content with it. It asks twice for that reason.'
  ),
  replayStep,
]

export const adminRolesTutorialSteps: TutorialStep[] = [
  section(
    'Roles and the permission matrix',
    'The top half assigns roles to members. The matrix below defines what each role can actually do — every permission, every role, one grid.\n\nA change here applies to everyone holding that role, immediately.'
  ),
  section(
    'Locks, history and reset',
    'Some cells are locked: permissions a role cannot lose without breaking the platform, with the reason on hover.\n\nPermission change history records who changed what and when. Reset returns the matrix to the shipped defaults — it undoes every customisation, not just the last one.'
  ),
  replayStep,
]

export const adminAchievementsTutorialSteps: TutorialStep[] = [
  section(
    'The badge catalogue',
    'Every achievement KTIP can award: its name, artwork, category, points and the rule that unlocks it.\n\nHidden badges do not appear in members’ galleries until earned — only their count does.'
  ),
  section(
    'Changing a badge that people already hold',
    'Editing points or criteria affects future awards, not the ones already granted — nobody loses a badge because the rule was tightened.\n\nThe trophy artwork is picked from the asset set; a badge with no art still works, it just looks unfinished on a profile.'
  ),
  replayStep,
]

export const adminModerationTutorialSteps: TutorialStep[] = [
  section(
    'Reported and flagged content',
    'Two queues in one place: content members reported, and content the automated rules flagged on their own.\n\nEach entry links to the thing itself, so you can read it in context before deciding.'
  ),
  section(
    'Acting, and the rules behind it',
    'Removing content hides it from everyone and notifies its author. Dismissing marks the report reviewed without acting, which is a real outcome and worth using when the report is unfounded.\n\nThe rules section is what drives the automated flags. Loosening one reduces false positives and lets more through — the trade is deliberate, so change it knowing which way you are moving.'
  ),
  replayStep,
]

export const adminInstitutionsTutorialSteps: TutorialStep[] = [
  section(
    'Schools, universities and Chambers',
    'Institutions that can vouch for their members, each with the email domains it owns.\n\nThose domains are load-bearing: a member signing up with an address at a verified domain can be recognised as belonging to that institution automatically.'
  ),
  section(
    'Review and rosters',
    'Reviewing an institution is what turns it live. Check the domain genuinely belongs to it — a domain attached to the wrong institution hands its members that institution’s standing.\n\nPending members lists people waiting to be confirmed onto a roster.'
  ),
  replayStep,
]

export const adminChamberTutorialSteps: TutorialStep[] = [
  section(
    'Businesses waiting on your Chamber',
    'SME verification submissions routed to your member state. Each carries the legal name, registration number and industry the applicant entered.\n\nYou see submissions for your own member state, which is why this list is shorter than the platform’s total.'
  ),
  section(
    'Verifying',
    'Check the legal name and registration number against the national corporate registry — that check is the entire value of the badge you are about to grant.\n\nApplicants cannot edit their submission after sending it, so a correction means rejecting with a reason and having them resubmit. Verified businesses show the badge on their profile and in the directory.'
  ),
  replayStep,
]

export const adminGrantsTutorialSteps: TutorialStep[] = [
  section(
    'Grants and their applications',
    'The top half is the grants themselves — create one, edit it, or deactivate it. Deactivating closes a grant without deleting it, so its page and everyone’s applications survive.\n\nThe lower half is the application queue.'
  ),
  section(
    'Reviewing applications',
    'Open one to read it as submitted. Approve, reject, or mark under review — the applicant sees the status change on My Applications, so “under review” is worth setting rather than leaving them at “submitted” for weeks.\n\nStudent applications need a sponsor’s approval before they reach you.'
  ),
  replayStep,
]

export const adminForumsTutorialSteps: TutorialStep[] = [
  section(
    'Boards and posts',
    'Create and edit the boards members post into. A board’s name and description are what tell people where a discussion belongs, so they do more work than they look like.'
  ),
  section(
    'Moderating',
    'Pin a post to hold it at the top of its board regardless of age — announcements, rules, a call for participants. Lock to keep it readable but closed to replies.\n\nRemoving a post takes it away for everyone, including the author. Locking is usually the proportionate move for a thread that has simply run its course.'
  ),
  replayStep,
]

export const adminResourcesTutorialSteps: TutorialStep[] = [
  section(
    'The knowledge base',
    'Articles, guides, case studies and templates shown at /resources. Each has a type and topic tags, which are what the public filters use.'
  ),
  section(
    'Publishing',
    'An unpublished resource is invisible to members — that is the draft state. Publishing puts it in the library immediately; there is no scheduling.\n\nFile-based resources upload here; text resources are read in full on the resource page without any download.'
  ),
  replayStep,
]

export const adminGrievancesTutorialSteps: TutorialStep[] = [
  section(
    'Reports about members',
    'Filed through the report form, with the category, description, and any evidence link the reporter added.\n\nThe person reported is not told who filed it. Keep it that way in anything you write back.'
  ),
  section(
    'Working a report',
    'Move it through its statuses as you go — the reporter sees that progress on My Reports, and it is the only thing they see.\n\nActing on the reported account happens under Users or Moderation; this queue is the record of the complaint, not the enforcement.'
  ),
  replayStep,
]

export const adminFeedbackTutorialSteps: TutorialStep[] = [
  section(
    'What members are telling us',
    'Bug reports, feature requests and general comments from the in-app feedback widget, newest first.\n\nOpen one for the full text plus the page it was sent from — which is usually the fastest way to understand a vague report.'
  ),
  section(
    'Triage',
    'Nothing here notifies the sender, so this queue is for you rather than a conversation. If a report needs a reply, reach the member directly.\n\nThe UAT section next door is the structured version of the same signal.'
  ),
  replayStep,
]

export const adminVerificationTutorialSteps: TutorialStep[] = [
  section(
    'Identity requests',
    'Members who have submitted documents to be verified, with what they uploaded.\n\nVerification is what puts the badge on a profile, and members use that badge to decide whether to take a funding or partnership conversation seriously.'
  ),
  section(
    'Reviewing a document',
    'Open the request to see the document alongside the profile it belongs to, and check the two agree.\n\nApproving grants the badge immediately. Rejecting should carry a reason — the member cannot tell what was wrong with an unexplained rejection, and will simply submit the same thing again.'
  ),
  replayStep,
]

export const adminIntegrationsTutorialSteps: TutorialStep[] = [
  section(
    'External tools',
    'The directory shown to members on the Integrations tab of /resources. Each entry is a tool KTIP points at, with its description and link.'
  ),
  section(
    'Publishing and removing',
    'Publish and unpublish control visibility without deleting the entry, so a tool that goes down temporarily can be pulled and restored.\n\nThese are outward links — an entry here is an implicit recommendation, so check the destination still is what it says before publishing.'
  ),
  replayStep,
]

export const adminEmployersTutorialSteps: TutorialStep[] = [
  section(
    'Employers',
    'Organisations recorded on the platform, with their verification state and whether the partner API may publish them.\n\nThose are two separate switches, and the second is the one with reach outside KTIP.'
  ),
  section(
    'Verification and history',
    'Reviewing an employer records who verified it and when — the history view shows that trail, which is what makes the badge auditable rather than merely present.\n\nAn employer marked publishable is served to external platforms through the partner API. Verify before publishing, never the other way round.'
  ),
  replayStep,
]

export const adminPartnerApiTutorialSteps: TutorialStep[] = [
  section(
    'Keys for external platforms',
    'Each key lets an outside system pull verified employer data. Issue one per partner, never one shared between them — a shared key cannot be revoked without cutting off everyone using it.'
  ),
  section(
    'Issuing and revoking',
    'The key is shown once, at the moment it is issued. It is not recoverable afterwards: copy it then, and if it is lost, revoke and issue a new one.\n\nRevoking takes effect immediately and breaks whatever is using it. That is the intended behaviour for a leaked key.'
  ),
  replayStep,
]

export const adminAnalyticsTutorialSteps: TutorialStep[] = [
  section(
    'Usage, not people',
    'Page views, feature usage, funnels and conversions across the platform.\n\nThis is aggregate behaviour — it answers “is anyone using this” rather than “what did this member do”.'
  ),
  section(
    'Reading the funnels',
    'A funnel shows where people stop. The gap between two steps is the useful number, not the totals either side of it.\n\nFigures depend on analytics consent, so they undercount rather than overcount. Treat them as a floor.'
  ),
  replayStep,
]

export const adminUatTutorialSteps: TutorialStep[] = [
  section(
    'Structured platform feedback',
    'Responses to the usefulness and experience questions, collected during user acceptance testing.\n\nUnlike the free-text feedback queue, these are comparable across members — which is what makes them worth charting.'
  ),
  section(
    'What to do with it',
    'Look for the questions where the spread is wide rather than the average is low: a feature half of members rate highly and half cannot use at all is a discoverability problem, and it reads as mediocre in the average.'
  ),
  replayStep,
]

export const adminErrorsTutorialSteps: TutorialStep[] = [
  section(
    'What is breaking',
    'Errors captured from real sessions, grouped into issues so a hundred occurrences of one bug are one row.\n\nThe columns are sortable and filterable, and Events is the count — a low-level error happening constantly usually matters more than a scary one that happened once.'
  ),
  section(
    'Working through them',
    'Open an issue for its stack, the route it happened on, and how often it recurs. Status marks what you have already triaged so the list stays meaningful.\n\nThe Error Simulator next door sends deliberate failures through the live pipeline — useful for confirming monitoring works, and it does produce real entries here.'
  ),
  replayStep,
]
