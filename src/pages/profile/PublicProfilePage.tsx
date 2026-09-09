import { useEffect, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router'
import {
  Camera,
  FileText,
  Flag,
  MessageSquare,
  Pencil,
  Trophy,
} from 'lucide-react'
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
import { heroButton } from '../../components/profile/PortraitHero'
// Still the opener for the not-found branch; the member page itself uses PortraitHero.
import { PageHero } from '../../components/layout/PageHero'
import { cn } from '../../lib/utils'
import { ProfileCanvas } from '../../components/profile/ProfileCanvas'

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
 * Layout is two columns above `lg`: a sticky rail holding the static "who"
 * (the identity plate, bio, details, skills, employer) and a scrolling column
 * holding the earned "what" (standing, trophies, projects, events). Above both,
 * PortraitHero opens with the member's cut-out portrait (148) — or their photo
 * in a diamond — and on desktop that portrait settles into the rail's diamond
 * as the page scrolls. Below `lg` the rail stacks above the
 * content. The single narrow column it replaced left half of a widescreen
 * empty and gave six identical bordered cards nothing to be measured against.
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
  // The hero's portrait flies into the rail's diamond on scroll; both ends are
  // measured live, so the hero only needs the elements.
  const railRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const trackFlag = useTrackFlag()

  const { view: profile, canView, loading: viewLoading } = useProfileView(id)
  const loading = resolvingId || viewLoading
  // Everything below the teaser hangs off this. Passing undefined disables
  // the query outright, so a gated page makes one request, not nine.
  const detailId = canView ? id : undefined

  const { projects } = useUserProjects(detailId)
  const { events } = useUserEvents(detailId)
  const { badges } = useUserBadges(detailId)
  const { count: connectionCount } = useConnectionCount(detailId)
  const { stats } = useProfileStats(detailId)
  const { assetMap } = useTrophyAssets()
  // The whole catalogue, for the "Locked" teaser under the trophy shelf. It is
  // a small, static list cached under one key across the app, so this costs a
  // request once per session rather than once per profile.
  const { badges: allBadges } = useAllBadges()
  // The business this member belongs to, if it has been Chamber-verified.
  // profiles.organization is free text and links nowhere; this is the entity.
  const { employer } = useEmployerForUser(detailId)
  const { items: portfolio } = useEmployerPortfolio(employer?.id)
  // The published CV was orphaned: /user/:id/cv existed and nothing linked to it.
  // public_resume() returns nothing unless it is published, so this both
  // decides whether to show the link and guarantees it goes somewhere.
  const { data: publicResume } = usePublicResume(detailId)
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
  // off a private one: there is nothing there to have explored.
  useEffect(() => {
    if (id && auth.user?.id && id !== auth.user.id && canView) trackFlag('directory_views')
  }, [id, auth.user?.id, canView, trackFlag])

  if (loading) {
    return (
      <>
        {/* Hero-band placeholder so the fixed white-text navbar has a dark
            band under it while the profile loads (same fix as the hero). */}
        <div className="bg-hero-base min-h-hero-band-compact" />
        <div className="mx-auto max-w-page-mid space-y-4 px-4 py-8">
          <div className="h-40 animate-pulse-soft rounded-surface-lg bg-ktip-sand-100" />
          <div className="h-64 animate-pulse-soft rounded-surface bg-ktip-sand-100" />
        </div>
      </>
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

  const canMessage = !isSelf && !!auth.user && canView && canDmAcrossAges(auth.profile, profile)
  const showCv = !isOrgAccount && !!publicResume

  // On the band: the same two actions in the band's materials, plus the CV
  // when it is published — and, on your own page, the two edits you came for.
  const heroActions = isSelf ? (
    <>
      {/* The profile tab IS the profile now, so "edit" is the same page with
          its pencils showing rather than a form somewhere else. `?edit=photo`
          replaces the old `#photo`, which anchored to a Card that no longer
          exists. */}
      <Link to="/dashboard/my-profile" className={cn(heroButton.base, heroButton.light)}>
        <Pencil size={17} aria-hidden="true" />
        <Trans>Edit profile</Trans>
      </Link>
      <Link to="/dashboard/my-profile?edit=photo" className={cn(heroButton.base, heroButton.ghost)}>
        <Camera size={17} aria-hidden="true" />
        <Trans>Change photo</Trans>
      </Link>
    </>
  ) : auth.user ? (
    <>
      <ConnectButton otherUserId={profile.id} tone="hero" />
      {canMessage && (
        <button
          type="button"
          onClick={() => openPanel({ userId: profile.id })}
          className={cn(heroButton.base, heroButton.ghost)}
        >
          <MessageSquare size={17} aria-hidden="true" />
          <Trans>Message</Trans>
        </button>
      )}
      {showCv && (
        <Link to={`/user/${routeParam}/cv`} className={cn(heroButton.base, heroButton.ghost)}>
          <FileText size={17} aria-hidden="true" />
          <Trans>CV</Trans>
        </Link>
      )}
    </>
  ) : null

  const railActions =
    !isSelf && auth.user ? (
      <>
        <ConnectButton otherUserId={profile.id} />
        {/* A private member is unreachable until they accept. Showing the
            button anyway would only produce a permission error from RLS. */}
        {/* And a 1:1 DM across the adult/minor line is refused by the
            server (091), so the same reasoning applies. */}
        {canMessage && (
          <Button
            variant="outline"
            icon={<MessageSquare size={16} />}
            onClick={() => openPanel({ userId: profile.id })}
          >
            <Trans>Message</Trans>
          </Button>
        )}
        {/* Icon-only: reporting a member is a rare, sober action and does
            not deserve the same width as the two things this page is for. */}
        <Link to={`/grievances/report/${profile.id}`} aria-label={t`Report`}>
          <Button
            variant="ghost"
            title={t`Report`}
            className="text-ktip-sand-500 hover:text-red-600"
          >
            <Flag size={16} aria-hidden="true" />
          </Button>
        </Link>
      </>
    ) : null

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
      cvHref={showCv ? `/user/${routeParam}/cv` : null}
      heroActions={heroActions}
      railActions={railActions}
      achievementsActions={
        isSelf ? (
          <Link to="/dashboard/achievements">
            <Button variant="ghost" size="sm" icon={<Trophy size={14} />}>
              <Trans>Manage your achievements</Trans>
            </Button>
          </Link>
        ) : null
      }
      privateMessage={privateProfileMessage}
      back={{ label: t`Member Directory`, href: '/directory' }}
      dockRef={dockRef}
      railRef={railRef}
    />
  )
}
