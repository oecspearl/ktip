import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { Camera, FileText, Mail, Pencil, Trophy } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConnectButton } from '../../components/directory/ConnectButton'
import { useProfileId, useProfileView, useUserProjects, useUserEvents } from '../../hooks/useProfile'
import { useConnectionStatus } from '../../hooks/useConnections'
import { useAllBadges, useUserBadges } from '../../hooks/useBadges'
import { useConnectionCount } from '../../hooks/useConnections'
import { usePublicResume } from '../../hooks/useResume'
import { useProfileStats } from '../../hooks/useProfileStats'
import { useTrophyAssets, useTrackFlag } from '../../hooks/useAchievements'
import { useAuth } from '../../contexts/AuthContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useCanonicalSlug } from '../../hooks/useCanonicalSlug'
import { isOrganizationAccount } from '../../lib/permissions'
import { canDmAcrossAges } from '../../lib/minor-safety'
import { useEmployerForUser, useEmployerPortfolio } from '../../hooks/useEmployerProfile'
import { Trans, useLingui } from '@lingui/react/macro'
// Still the opener for the not-found branch; the member page itself is ProfileCanvas.
import { PageHero } from '../../components/layout/PageHero'
import { ProfileCanvas, type ExperienceRow } from '../../components/profile/ProfileCanvas'
import { hiddenSections, PROFILE_SECTIONS } from '../../lib/profile-visibility'
import type { ProfileSectionKey } from '../../types'

/** How many unearned badges the shelf teases under the earned ones. */
const LOCKED_PREVIEW = 4

/**
 * The shareable member page, back after being folded into a drawer.
 *
 * The drawer over /directory is still the in-app default — it is faster and
 * keeps you in context. This page exists for the case the drawer cannot serve:
 * a URL someone can send to a funder, post in a chat, or screenshot. A rank
 * nobody outside the app can see is not worth chasing.
 *
 * Signed-in only since 083 — a member page is a person, not a brochure — and
 * a member who has gone private shows the teaser plus a way to ask, nothing
 * more. get_profile_view() decides that; the page only branches on can_view.
 * Points and rank come from get_profile_stats(), which returns nothing for a
 * suspended account and hides the streak from everyone but its owner.
 *
 * The layout is ProfileCanvas's editorial page: the member's portrait (their
 * cut-out on the backdrop they chose, 148) beside their name, then Overview,
 * Projects, Events and Achievements tabs. The member picks the look —
 * colour or black & white, an accent, where the portrait stands (169).
 */
export default function PublicProfilePage() {
    const { t } = useLingui()
  // The route segment is a username or a uuid; everything downstream wants the
  // uuid, but links keep whichever form the visitor arrived on.
  const { id: routeParam } = useParams()
  const { id, username, loading: resolvingId } = useProfileId(routeParam)
  // Arriving on /u/<uuid> — an old link, or one built from a row that only
  // carried a user id — rewrites itself to /u/<username>.
  useCanonicalSlug(routeParam, id ? { id, slug: username } : null)
  const auth = useAuth()
  const { openPanel } = useMessagingPanel()
  const trackFlag = useTrackFlag()

  const { view: profile, canView, loading: viewLoading } = useProfileView(id)
  const loading = resolvingId || viewLoading
  // Everything below the teaser hangs off this, one section at a time (162).
  // Passing undefined disables a query outright, so a closed section costs no
  // request — and nothing is asked until the view has said what is closed.
  const hidden = hiddenSections(profile)
  const idFor = (...sections: ProfileSectionKey[]) =>
    profile && sections.some((section) => !hidden.has(section)) ? id : undefined

  const { projects } = useUserProjects(idFor('projects'))
  const { events } = useUserEvents(idFor('events'))
  const { badges } = useUserBadges(idFor('achievements'))
  const { count: connectionCount } = useConnectionCount(idFor('standing'))
  // Feeds both the meter and the shelf's pinned order; the server leaves out
  // whichever half this viewer may not see.
  const { stats } = useProfileStats(idFor('standing', 'achievements'))
  const { assetMap } = useTrophyAssets()
  // The whole catalogue, for the "Locked" teaser under the trophy shelf. It is
  // a small, static list cached under one key across the app, so this costs a
  // request once per session rather than once per profile.
  const { badges: allBadges } = useAllBadges()
  // The business this member belongs to, if it has been Chamber-verified.
  // profiles.organization is free text and links nowhere; this is the entity.
  const { employer } = useEmployerForUser(idFor('organisation'))
  const { items: portfolio } = useEmployerPortfolio(employer?.id)
  // The published CV was orphaned: /user/:id/cv existed and nothing linked to it.
  // public_resume() returns nothing unless it is published, so this both
  // decides whether to show the link and guarantees it goes somewhere.
  const { data: publicResume } = usePublicResume(idFor('cv'))
  // Drives the copy on the private panel: "request sent" is a different thing
  // to say than "send a request", and the button already knows which it is.
  const { state: connectionState } = useConnectionStatus(auth.user?.id, id)

  const displayName = profile?.display_name || t`Member`
  usePageTitle(profile ? displayName : t`Member`)

  // The nearest few badges this member has not earned. Hidden badges stay
  // hidden — that is the whole point of `is_hidden` — and the catalogue is
  // already ordered by sort_order, so "nearest" is the curator's own ordering.
  const lockedPreview = useMemo(() => {
    if (!allBadges || !badges) return []
    const earned = new Set(badges.map((b) => b.badge_id))
    return allBadges.filter((b) => !b.is_hidden && !earned.has(b.id)).slice(0, LOCKED_PREVIEW)
  }, [allBadges, badges])

  // Powers the 'explorer' hidden achievement. Viewing your own page does not
  // count — that would be a free badge for reloading. Neither does bouncing
  // off one with every section closed: there is nothing there to have explored.
  const anythingToSee = !!profile && hidden.size < PROFILE_SECTIONS.length
  useEffect(() => {
    if (id && auth.user?.id && id !== auth.user.id && anythingToSee) trackFlag('directory_views')
  }, [id, auth.user?.id, anythingToSee, trackFlag])

  if (loading) {
    return (
      // The navbar is solid over member pages, so the placeholder is the page's
      // own shape: the hero panel, then the tab row.
      <div className="mx-auto max-w-page-mid space-y-4 px-4 pb-8 pt-[calc(var(--nav-h)+1.5rem)]">
        <div className="h-[32rem] animate-pulse-soft rounded-surface-lg bg-ktip-sand-100" />
        <div className="h-14 w-80 max-w-full animate-pulse-soft rounded-surface bg-ktip-sand-100" />
      </div>
    )
  }

  if (!profile) {
    return (
      <>
        <PageHero
          compact
          backAlways
          eyebrow={t`Member`}
          title={t`Member not found`}
          breadcrumb={[
            { label: t`Home`, href: '/' },
            { label: t`Member Directory`, href: '/directory' },
          ]}
        />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-caption text-ktip-sand-600">
            <Trans>This profile does not exist, or is no longer available.</Trans>
          </p>
          <Link to="/directory" className="mt-4 inline-block">
            <Button variant="outline" size="sm"><Trans>Browse the directory</Trans></Button>
          </Link>
        </div>
      </>
    )
  }

  const isSelf = id === auth.user?.id
  // An organisation account's page leads with the business, not a CV it will
  // never have. Individual accounts are untouched.
  const isOrgAccount = isOrganizationAccount(profile.roles)
  // Chrome around the connection-privacy notice — displayName is the member's
  // own name and is never translated, but the sentence around it is.
  const privateProfileMessage =
    connectionState === 'pending_sent'
      ? t`${displayName} has your connection request. Once they accept it you will see their full profile and be able to message them.`
      : connectionState === 'pending_received'
        ? t`${displayName} has asked to connect with you. Accept and you will both see each other's full profile.`
        : t`Only ${displayName}'s connections can see their full profile or send them a message. Send a connection request to ask.`

  const partialProfileMessage = t`Some of ${displayName}'s profile is for their connections only.`

  // canView is still the master switch (083), and so still the messaging
  // rule: opening a section of a private profile does not open the inbox.
  const canMessage = !isSelf && !!auth.user && canView && canDmAcrossAges(auth.profile, profile)
  const showCv = !isOrgAccount && !!publicResume

  const pagePath = `/user/${username || routeParam}`
  const message = () => openPanel({ userId: profile.id })

  // In the hero: Connect and Message (Message only where the server would let
  // it through — a private member until they accept, and never across the
  // adult/minor line, 091), the CV when it is published — and, on your own
  // page, the two edits you came for. The profile tab IS the profile, so
  // "edit" is the same page with its pencils showing.
  const heroActions = isSelf ? (
    <>
      <Link to="/dashboard/my-profile" className="pf-btn pf-btn--primary">
        <Pencil size={17} aria-hidden="true" />
        <Trans>Edit profile</Trans>
      </Link>
      <Link to="/dashboard/my-profile?edit=photo" className="pf-btn pf-btn--soft">
        <Camera size={17} aria-hidden="true" />
        <Trans>Change photo</Trans>
      </Link>
    </>
  ) : auth.user ? (
    <>
      <ConnectButton otherUserId={profile.id} tone="editorial" />
      {canMessage && (
        <button type="button" onClick={message} className="pf-btn pf-btn--soft">
          <Mail size={17} aria-hidden="true" />
          <Trans>Message</Trans>
        </button>
      )}
      {showCv && (
        <Link to={`${pagePath}/cv`} className="pf-btn pf-btn--soft">
          <FileText size={17} aria-hidden="true" />
          <Trans>CV</Trans>
        </Link>
      )}
    </>
  ) : null

  // The footer and the phone dock: the same two actions again, at the end of
  // the page and always in reach on a phone. Not on your own page.
  const ctaActions =
    !isSelf && auth.user ? (
      <>
        <ConnectButton otherUserId={profile.id} tone="editorial-light" />
        {canMessage && (
          <button type="button" onClick={message} className="pf-btn pf-btn--ghost-dark">
            <Mail size={17} aria-hidden="true" />
            <Trans>Message</Trans>
          </button>
        )}
      </>
    ) : null

  const dockActions = isSelf ? (
    <Link to="/dashboard/my-profile" className="pf-btn pf-btn--light pf-btn--sm">
      <Pencil size={16} aria-hidden="true" />
      <Trans>Edit</Trans>
    </Link>
  ) : auth.user ? (
    <>
      <ConnectButton otherUserId={profile.id} tone="editorial-light" size="sm" />
      {canMessage && (
        <button
          type="button"
          onClick={message}
          aria-label={t`Message ${displayName}`}
          className="pf-btn pf-btn--ghost-dark pf-btn--sm"
        >
          <Mail size={16} aria-hidden="true" />
        </button>
      )}
    </>
  ) : null

  // The roles off the published CV, for the Overview's experience list.
  const experience: ExperienceRow[] = (publicResume?.data.roles ?? [])
    .filter((role) => role.title || role.org)
    .slice(0, 6)
    .map((role) => ({ period: role.period, title: role.title, org: role.org, location: role.location }))

  return (
    <ProfileCanvas
      view={profile}
      canView={canView}
      projects={projects}
      events={events}
      badges={badges}
      lockedBadges={lockedPreview}
      trophyAssets={assetMap}
      stats={stats}
      connectionCount={connectionCount}
      employer={employer}
      employerPortfolio={portfolio}
      cvHref={showCv ? `${pagePath}/cv` : null}
      experience={showCv ? experience : undefined}
      heroActions={heroActions}
      ctaActions={ctaActions}
      dockActions={dockActions}
      reportHref={!isSelf && auth.user ? `/grievances/report/${profile.id}` : null}
      shareUrl={pagePath}
      achievementsActions={
        isSelf ? (
          <Link to="/dashboard/achievements" className="pf-chipl">
            <Trophy size={14} aria-hidden="true" />
            <Trans>Manage your achievements</Trans>
          </Link>
        ) : null
      }
      privateMessage={privateProfileMessage}
      partialMessage={partialProfileMessage}
      back={{ label: t`Member Directory`, href: '/directory' }}
    />
  )
}
