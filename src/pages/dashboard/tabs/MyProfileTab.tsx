import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { FileText, MessageSquare, UserPlus } from 'lucide-react'
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
import { cn } from '../../../lib/utils'
import { asVisitorView, draftToView } from '../../../lib/profile-visibility'
import { heroButton } from '../../../components/profile/PortraitHero'
import {
  ProfileCanvas,
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

  const handleLockChange = async (next: boolean) => {
    setLocked(next)
    setSavingLock(true)
    try {
      await auth.updateProfile({ profile_visibility: next ? 'private' : 'public' })
      toast.success(
        next
          ? t`Profile locked. Members must connect with you to see your details or message you.`
          : t`Profile unlocked. Any member can view your full profile.`
      )
    } catch (err: any) {
      setLocked(!next)
      toast.error(err.message || t`Failed to update profile privacy`)
    } finally {
      setSavingLock(false)
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

  const own = draftToView(auth.profile, draft.draft)
  const view = asVisitor ? asVisitorView(own) : own
  // Only ever false in visitor mode: your own view is never gated.
  const canView = view.can_view
  const gated = canView === false

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
      }

  // A visitor's buttons, drawn and inert. Rendering the live controls would
  // point Connect and Message at yourself, and both would issue a real request.
  const visitorActions = asVisitor ? (
    <>
      <span aria-disabled className={cn(heroButton.base, heroButton.light, 'pointer-events-none opacity-80')}>
        <UserPlus size={17} aria-hidden="true" />
        <Trans>Connect</Trans>
      </span>
      {!gated && (
        <span aria-disabled className={cn(heroButton.base, heroButton.ghost, 'pointer-events-none opacity-80')}>
          <MessageSquare size={17} aria-hidden="true" />
          <Trans>Message</Trans>
        </span>
      )}
      {!gated && cvHref && (
        <span aria-disabled className={cn(heroButton.base, heroButton.ghost, 'pointer-events-none opacity-80')}>
          <FileText size={17} aria-hidden="true" />
          <Trans>CV</Trans>
        </span>
      )}
    </>
  ) : undefined

  return (
    <div className="grid gap-card-gap">
      <ProfilePreviewToolbar
        locked={locked}
        onLockChange={handleLockChange}
        savingLock={savingLock || auth.profileLoading}
        asVisitor={asVisitor}
        onAsVisitorChange={setAsVisitor}
        profileHref={profileHref}
      />

      <ProfileCanvas
        view={view}
        canView={canView}
        // A gated view collapses the earned column the same way the member
        // page's `detailId = canView ? id : undefined` does — there, by never
        // issuing the queries; here, by not handing over what they returned.
        projects={gated ? undefined : projects}
        events={gated ? undefined : events}
        badges={gated ? undefined : badges}
        lockedBadges={gated ? undefined : lockedPreview}
        trophyAssets={assetMap}
        stats={gated ? undefined : stats}
        connectionCount={gated ? undefined : connectionCount}
        employer={gated ? undefined : employer}
        employerPortfolio={gated ? undefined : portfolio}
        cvHref={gated ? null : cvHref}
        heroActions={visitorActions}
        // No rail actions on either side of the toggle: your own plate has
        // nobody to connect to, and repeating the inert visitor cluster a few
        // hundred pixels below the band reads as a rendering bug.
        privateMessage={t`Only your connections can see your full profile or send you a message. A member who has not connected with you sees this instead.`}
        back={{ label: t`Dashboard`, href: '/dashboard' }}
        edit={edit}
        layout="pane"
        // The dashboard's own PageHero already owns `id="page-top"` and the
        // rail's "Top" step; a second of each inside <main> is a duplicate DOM
        // id and a duplicate dash.
        heroSpy={null}
      />

      <ProfileBlockModal block={block} onClose={closeBlock} draft={draft} />
    </div>
  )
}
