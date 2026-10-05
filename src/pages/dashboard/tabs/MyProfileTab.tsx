import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { FileText, Mail, UserPlus } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useUserProjects, useUserEvents } from '../../../hooks/useProfile'
import { useAllBadges, useUserBadges } from '../../../hooks/useBadges'
import { useConnectionCount } from '../../../hooks/useConnections'
import { useProfileStats } from '../../../hooks/useProfileStats'
import { useTrophyAssets } from '../../../hooks/useAchievements'
import { useEmployerForUser, useEmployerPortfolio } from '../../../hooks/useEmployerProfile'
import { usePublicResume } from '../../../hooks/useResume'
import { isOrganizationAccount } from '../../../lib/permissions'
import { memberPath } from '../../../lib/slug'
import {
  asVisitorView,
  draftToView,
  hiddenSections,
  sectionExceptions,
  sectionIsPrivate,
  withSection,
} from '../../../lib/profile-visibility'
import type { ProfileSectionKey, ProfileView, SectionVisibility } from '../../../types'
import {
  ProfileCanvas,
  type ExperienceRow,
  type ProfileBlock,
  type ProfileEditMap,
} from '../../../components/profile/ProfileCanvas'
import { ProfileBlockModal } from './my-profile/ProfileBlockModal'
import { ProfilePreviewToolbar } from './my-profile/ProfilePreviewToolbar'
import { useProfileDraft } from './my-profile/useProfileDraft'
import { Trans, useLingui } from '@lingui/react/macro'

/** How many unearned badges the shelf teases under the earned ones. */
const LOCKED_PREVIEW = 4

/** Valid `?edit=` values — the deep link the member page's "Change photo" uses. */
const BLOCKS = new Set<ProfileBlock>([
  'banner',
  'photo',
  'identity',
  'about',
  'details',
  'skills',
  'interests',
  'languages',
  'openTo',
  'look',
])

/**
 * The member's public face — as it actually looks, and edited there.
 *
 * This tab used to be a twelve-field form that told you nothing about what
 * your edits would produce; you saved, then navigated to /user/:id to find
 * out. It now renders the member page itself from a live draft, with a pencil
 * on every block that can be changed, so the answer to "what will this look
 * like" is the screen you are already on.
 *
 * Two things sit above the preview because they are not part of it:
 *  - the profile lock — profile_visibility, enforced server-side by
 *    get_profile_view() and the conversation_participants policy (083).
 *    Locked is not invisible: the directory teaser (name, photo, country)
 *    stays either way; details and messaging require an accepted connection,
 *    and the connection request *is* the access request.
 *    Each section can then go the other way on its own (162): a switch on
 *    its heading, stored as an exception in section_visibility. The lock is
 *    "the whole page", so flipping it clears the exceptions.
 *  - "view as a visitor", which re-renders the same draft through that gate.
 *    It has to be done here rather than by asking the server, because
 *    can_view_profile() returns TRUE for the owner before it ever reads the
 *    setting — you cannot fetch your own locked view. See lib/profile-visibility.
 *
 * The earned column — standing, trophies, projects, events — is read-only
 * here. It is a record of what happened, not a field.
 */
export default function MyProfileTab() {
  const { t } = useLingui()
  usePageTitle(t`My Profile`)
  const auth = useAuth()
  const toast = useToast()

  // ------------------------------------------------------------- the editors
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedBlock = searchParams.get('edit')
  const [block, setBlock] = useState<ProfileBlock | null>(null)

  useEffect(() => {
    if (requestedBlock && BLOCKS.has(requestedBlock as ProfileBlock)) {
      setBlock(requestedBlock as ProfileBlock)
    }
  }, [requestedBlock])

  const closeBlock = () => {
    setBlock(null)
    if (searchParams.has('edit')) {
      const next = new URLSearchParams(searchParams)
      next.delete('edit')
      setSearchParams(next, { replace: true })
    }
  }

  // Paused while a dialog is open: that is the only window in which the draft
  // can legitimately differ from the row, so outside it the two re-sync.
  const draft = useProfileDraft(block !== null)

  // --------------------------------------------------------------- the lock
  // Local mirror so the switch flips instantly; the profile row is the source
  // of truth once the refetch lands. Absent column (deploy ahead of migration
  // 083) reads as public, matching the column default.
  const [locked, setLocked] = useState(false)
  const [savingLock, setSavingLock] = useState(false)
  useEffect(() => {
    if (auth.profile) setLocked(auth.profile.profile_visibility === 'private')
  }, [auth.profile?.profile_visibility, auth.profile])

  // Per-section overrides of the lock (162), mirrored the same way. The map
  // holds only the exceptions; withSection() drops an entry that agrees with
  // the lock rather than storing it.
  const [sections, setSections] = useState<SectionVisibility>({})
  const [savingSections, setSavingSections] = useState(false)
  useEffect(() => {
    if (auth.profile) setSections(auth.profile.section_visibility ?? {})
  }, [auth.profile?.section_visibility, auth.profile])

  // The lock is "the whole page", so flipping it clears every exception —
  // otherwise "make it all private" would leave the parts you once opened
  // standing open.
  const handleLockChange = async (next: boolean) => {
    const previousSections = sections
    setLocked(next)
    setSections({})
    setSavingLock(true)
    try {
      await auth.updateProfile({
        profile_visibility: next ? 'private' : 'public',
        section_visibility: {},
      })
      toast.success(
        next
          ? t`Profile locked. Members must connect with you to see your details or message you.`
          : t`Profile unlocked. Any member can view your full profile.`
      )
    } catch (err: any) {
      setLocked(!next)
      setSections(previousSections)
      toast.error(err.message || t`Failed to update profile privacy`)
    } finally {
      setSavingLock(false)
    }
  }

  const master = locked ? 'private' : 'public'
  const handleSectionChange = async (section: ProfileSectionKey, makePrivate: boolean) => {
    const previous = sections
    const next = withSection(sections, master, section, makePrivate)
    setSections(next)
    setSavingSections(true)
    try {
      await auth.updateProfile({ section_visibility: next })
    } catch (err: any) {
      setSections(previous)
      toast.error(err.message || t`Failed to update profile privacy`)
    } finally {
      setSavingSections(false)
    }
  }

  // ------------------------------------------------------------ the preview
  const [asVisitor, setAsVisitor] = useState(false)
  const userId = auth.user?.id

  const { projects } = useUserProjects(userId)
  const { events } = useUserEvents(userId)
  const { badges } = useUserBadges(userId)
  const { count: connectionCount } = useConnectionCount(userId)
  const { stats } = useProfileStats(userId)
  const { assetMap } = useTrophyAssets()
  const { badges: allBadges } = useAllBadges()
  const { employer } = useEmployerForUser(userId)
  const { items: portfolio } = useEmployerPortfolio(employer?.id)
  const { data: publicResume } = usePublicResume(userId)

  // Deliberately NOT useTrackFlag('directory_views') — that powers the
  // 'explorer' achievement and the member page already refuses to count your
  // own page. Firing it here would hand out the badge for opening the editor.

  const lockedPreview = useMemo(() => {
    if (!allBadges || !badges) return []
    const earned = new Set(badges.map((b) => b.badge_id))
    return allBadges.filter((b) => !b.is_hidden && !earned.has(b.id)).slice(0, LOCKED_PREVIEW)
  }, [allBadges, badges])

  if (!auth.profile) {
    return (
      <div className="grid gap-card-gap">
        <div className="h-64 animate-pulse-soft rounded-surface-lg bg-ktip-sand-100" />
        <div className="h-40 animate-pulse-soft rounded-surface bg-ktip-sand-100" />
      </div>
    )
  }

  // The lock and the sections from their local mirrors, so the preview moves
  // the moment a switch does rather than when the write comes back.
  const own: ProfileView = { ...draftToView(auth.profile, draft.draft), profile_visibility: master }
  const view = asVisitor ? asVisitorView(own, sections) : own
  // Only ever false in visitor mode: your own view is never gated.
  const canView = view.can_view
  // Empty on your own view; in visitor mode, every section kept for connections.
  const hidden = hiddenSections(view)
  const shows = (section: ProfileSectionKey) => !hidden.has(section)
  const exceptions = sectionExceptions(master, sections)

  const isOrgAccount = isOrganizationAccount(view.roles)
  const profileHref = memberPath(auth.profile)
  const cvHref = !isOrgAccount && publicResume ? `${profileHref}/cv` : null

  // Every pencil, in one place — so visitor mode turns them all off by simply
  // not passing the map, with no per-block branching anywhere.
  const edit: ProfileEditMap | undefined = asVisitor
    ? undefined
    : {
        banner: () => setBlock('banner'),
        photo: () => setBlock('photo'),
        identity: () => setBlock('identity'),
        about: () => setBlock('about'),
        details: () => setBlock('details'),
        skills: () => setBlock('skills'),
        interests: () => setBlock('interests'),
        languages: () => setBlock('languages'),
        openTo: () => setBlock('openTo'),
        look: () => setBlock('look'),
      }

  // A visitor's buttons, drawn and inert. Rendering the live controls would
  // point Connect and Message at yourself, and both would issue a real request.
  const visitorActions = asVisitor ? (
    <>
      <span aria-disabled="true" className="pf-btn pf-btn--primary">
        <UserPlus size={17} aria-hidden="true" />
        <Trans>Connect</Trans>
      </span>
      {/* The lock, not the sections, decides Message — as can_dm() does. */}
      {canView !== false && (
        <span aria-disabled="true" className="pf-btn pf-btn--soft">
          <Mail size={17} aria-hidden="true" />
          <Trans>Message</Trans>
        </span>
      )}
      {shows('cv') && cvHref && (
        <span aria-disabled="true" className="pf-btn pf-btn--soft">
          <FileText size={17} aria-hidden="true" />
          <Trans>CV</Trans>
        </span>
      )}
    </>
  ) : undefined

  const experience: ExperienceRow[] = (publicResume?.data.roles ?? [])
    .filter((role) => role.title || role.org)
    .slice(0, 6)
    .map((role) => ({ period: role.period, title: role.title, org: role.org, location: role.location }))

  return (
    <div className="grid gap-card-gap">
      <ProfilePreviewToolbar
        locked={locked}
        onLockChange={handleLockChange}
        savingLock={savingLock || savingSections || auth.profileLoading}
        exceptions={exceptions}
        asVisitor={asVisitor}
        onAsVisitorChange={setAsVisitor}
        profileHref={profileHref}
      />

      <ProfileCanvas
        view={view}
        canView={canView}
        // A closed section drops out of the earned column the same way the
        // member page's per-section ids do — there, by never issuing the
        // query; here, by not handing over what it returned.
        projects={shows('projects') ? projects : undefined}
        events={shows('events') ? events : undefined}
        badges={shows('achievements') ? badges : undefined}
        lockedBadges={shows('achievements') ? lockedPreview : undefined}
        trophyAssets={assetMap}
        stats={shows('standing') || shows('achievements') ? stats : undefined}
        connectionCount={shows('standing') ? connectionCount : undefined}
        employer={shows('organisation') ? employer : undefined}
        employerPortfolio={shows('organisation') ? portfolio : undefined}
        cvHref={shows('cv') ? cvHref : null}
        experience={shows('cv') && cvHref ? experience : undefined}
        heroActions={visitorActions}
        // No rail actions on either side of the toggle: your own plate has
        // nobody to connect to, and repeating the inert visitor cluster a few
        // hundred pixels below the band reads as a rendering bug.
        privateMessage={t`Only your connections can see your full profile or send you a message. A member who has not connected with you sees this instead.`}
        partialMessage={t`The parts you keep for connections are left out. This is what a member who has not connected with you sees.`}
        back={{ label: t`Dashboard`, href: '/dashboard' }}
        edit={edit}
        // The switches live on the sections themselves, and only on your own
        // view: in visitor mode there is nothing to set, only something to see.
        privacy={
          asVisitor
            ? undefined
            : {
                isPrivate: (section) => sectionIsPrivate(section, master, sections),
                onChange: handleSectionChange,
                disabled: savingSections || savingLock,
              }
        }
        layout="pane"
        // The dashboard's own PageHero already owns `id="page-top"` and the
        // rail's "Top" step; a second of each inside <main> is a duplicate DOM
        // id and a duplicate dash.
        heroSpy={null}
      />

      <ProfileBlockModal block={block} onClose={closeBlock} draft={draft} onSwitch={setBlock} />
    </div>
  )
}
