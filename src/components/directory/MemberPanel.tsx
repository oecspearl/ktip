import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  Calendar,
  CheckCircle,
  ChevronRight,
  Flag,
  FolderKanban,
  Handshake,
  Lock,
  MessageSquare,
  X,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { ConnectButton } from './ConnectButton'
import { useProfileId, useProfileView, useUserProjects, useUserEvents } from '../../hooks/useProfile'
import { useUserBadges } from '../../hooks/useBadges'
import { useConnectionCount } from '../../hooks/useConnections'
import { useProfileStats } from '../../hooks/useProfileStats'
import { useTrophyAssets } from '../../hooks/useAchievements'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { useAuth } from '../../contexts/AuthContext'
import { dmBlockedReason } from '../../lib/minor-safety'
import { heroImageFor, gradientFor } from '../../lib/hero-images'
import { BANNER_WASH, bannerImage, bannerPosition, isGradientBanner, parseBanner } from '../../lib/banner'
import { BannerAurora } from '../profile/BannerAurora'
import { IdentityPlate } from '../profile/IdentityPlate'
import { ProfileSection } from '../profile/ProfileSection'
import { ProfileFacts } from '../profile/ProfileFacts'
import { ProfileTags } from '../profile/ProfileTags'
import { ProfileLinkRow } from '../profile/ProfileLinkRow'
import { StandingMeter } from '../profile/StandingMeter'
import { TrophyShelf } from '../profile/TrophyShelf'
import {
  COLLABORATION_LABELS,
  COLLAB_EXCLUSIVE_VALUE,
  PHASE_LABELS,
} from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import { entityPath, memberPath } from '../../lib/slug'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

/** Trophies shown before the shelf collapses into a "+N" tile. */
const SHELF_MAX = 5

/**
 * Read-only member preview, opened from anywhere a member's name appears.
 * Replaces the old /profile/:id page — see MemberPanelContext. Slides in from
 * the right edge over the whole page, dimmed backdrop behind it; closes via X,
 * Escape, the backdrop, or an outside click.
 * z-drawer sits above the navbar but under Modal and the FAB
 * so a dialog opened from the drawer still layers on top.
 *
 * One column at every width. It used to split into an identity rail beside a
 * narrative column above a `@[46rem]` container query — but the drawer is
 * `45vw`, so that threshold needed a 1636px viewport and never fired on a
 * laptop. The drawer had two layouts and nearly everyone only ever saw the
 * fallback; one column that is actually designed beats two where one is dead.
 *
 * The actions are pinned to the bottom instead of sitting mid-scroll. Connect
 * and Message are the two things this surface exists to offer, and they were
 * the first things to leave the viewport.
 */
export function MemberPanel() {
  const { t, i18n } = useLingui()
  const { memberId, isOpen, closeMember } = useMemberPanel()
  const { openPanel } = useMessagingPanel()
  const auth = useAuth()
  const panelRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const openedAt = useRef<string | null>(null)

  // The directory list is open to anyone; the member behind a card is not.
  // Nothing is fetched at all for a signed-out visitor — the drawer shows the
  // sign-in gate instead (083).
  const signedIn = !!auth.user

  // Exit animation: closeMember() nulls memberId immediately, but an instant
  // vanish reads as a glitch next to the slide-in. So the drawer stays mounted
  // for one animation's worth of time, sliding out, rendered from the LAST
  // member it showed — the queries below keep that id so the content cannot
  // flash to a skeleton mid-exit. The timeout (not animationend) unmounts, so
  // reduced-motion users — whose animations are `none` — are not stuck.
  const [closing, setClosing] = useState(false)
  const lastMemberId = useRef<string | null>(null)
  if (memberId) lastMemberId.current = memberId
  useEffect(() => {
    if (isOpen) {
      setClosing(false)
      return
    }
    if (lastMemberId.current === null) return
    setClosing(true)
    const timer = setTimeout(() => setClosing(false), 340)
    return () => clearTimeout(timer)
  }, [isOpen])
  const activeSegment = memberId ?? (closing ? lastMemberId.current : null)
  const show = isOpen || closing

  // `memberId` is whatever is in `?member=` — a username since the URLs were
  // made readable, a uuid on an older link. get_profile_view() takes a uuid.
  const { id: resolvedId, username, loading: resolvingId } = useProfileId(
    activeSegment ?? undefined
  )
  const { view: rawProfile, canView, isPrivate, loading: viewLoading } = useProfileView(
    resolvedId,
    signedIn
  )
  const loading = resolvingId || viewLoading
  // get_profile_view() has a fixed return signature with no username in it, so
  // the "view full profile" link below gets it from the lookup instead.
  const profile = rawProfile ? { ...rawProfile, username } : rawProfile
  // Undefined disables the query outright, so a private member costs one
  // request rather than six that each come back empty.
  const detailId = canView ? resolvedId : undefined

  const { projects } = useUserProjects(detailId)
  const { events } = useUserEvents(detailId)
  const { badges } = useUserBadges(detailId)
  // null when this viewer isn't allowed to see the count (owner's setting)
  const { count: connectionCount } = useConnectionCount(detailId)
  // null for suspended accounts; the drawer just omits the row in that case
  const { stats } = useProfileStats(detailId)
  // Trophy artwork, keyed type x tier. Cached under one key for the whole app,
  // so opening a second card costs nothing.
  const { assetMap } = useTrophyAssets()

  // Condensed header handoff: a 1px sentinel sits under the name, and the
  // header fades in once it scrolls out. Same trick DashboardLayout uses to
  // hand off to DashboardTopBar. An observer rather than a scroll listener so
  // nothing runs per frame while the drawer is being flung.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [condensed, setCondensed] = useState(false)
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setCondensed(!entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(node)
    return () => observer.disconnect()
    // Re-attaches when the body swaps between the gate, the private panel and
    // the full profile, since the sentinel only exists in the last of those.
  }, [show, canView, signedIn, loading])

  // Escape closes the drawer — unless an open Modal (role="dialog") owns the key.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('[role="dialog"]')) return
      closeMember()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, closeMember])

  // Clicking outside closes. Ignores modals and the FAB, same as MessagingPanel.
  useEffect(() => {
    if (!isOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element
      if (panelRef.current?.contains(target)) return
      if (target.closest('[role="dialog"]')) return
      if (target.closest('[data-fab]')) return
      closeMember()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [isOpen, closeMember])

  // Leaving the page closes the drawer. The links inside must NOT close it
  // themselves: react-router runs navigation inside startTransition, so an
  // urgent closeMember() from an onClick commits first, and DirectoryPage's
  // still-mounted URL sync then replaces the location to drop `?member=` —
  // which supersedes the transition and the click appears to do nothing.
  // Watching the pathname instead means the navigation always wins.
  useEffect(() => {
    if (!isOpen) {
      openedAt.current = null
      return
    }
    if (openedAt.current === null) {
      openedAt.current = pathname
      return
    }
    if (openedAt.current !== pathname) closeMember()
  }, [isOpen, pathname, closeMember])

  // The drawer scrolls its own content, so freeze the page behind it —
  // otherwise a wheel over the backdrop scrolls the list out from under it.
  // Held through the exit animation: releasing at close-start brings the page
  // scrollbar back mid-slide, and that layout shift reads as a glitch.
  useEffect(() => {
    if (!show) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [show])

  if (!show) return null

  const isSelf = resolvedId === auth.user?.id
  // Explains itself rather than silently dropping the button: the panel is
  // where someone goes deliberately to contact a member, and a missing action
  // with no reason reads as a bug.
  const dmBlocked = dmBlockedReason(auth.profile, profile)
  const displayName = profile?.display_name || 'Unknown User'
  const firstName = displayName.split(' ')[0]
  // Same seeded photo the member's directory card uses, so opening a card feels
  // like the card expanding rather than a jump to an unrelated screen.
  // Seeded off the id, not the URL segment: the same member must get the same
  // cover whether they were opened by username or by uuid.
  const coverSeed = resolvedId ?? 'member'
  const coverBanner = parseBanner(profile?.banner)
  const hasSections = !!(
    profile?.bio ||
    badges?.length ||
    profile?.skills?.length ||
    profile?.interests?.length ||
    profile?.open_to?.length ||
    projects?.length ||
    events?.length
  )
  // The pinned footer only makes sense once there is a member behind it.
  const showFooter = signedIn && !!profile && !loading

  return (
    <>
      {/* Dims the page so the drawer reads as the foreground layer */}
      <div
        aria-hidden
        data-member-scrim
        onClick={closeMember}
        className={
          // Stays clickable while closing on purpose: the mousedown that
          // closed the drawer is followed by a click at mouseup, and with the
          // scrim gone (or pointer-inert) that click lands on whatever card
          // sits under the cursor and re-opens the drawer.
          `fixed inset-0 z-scrim bg-brand-navy/45 backdrop-blur-[3px] ${
            closing ? 'animate-fade-out' : 'animate-fade-in'
          }`
        }
      />
      <section
        ref={panelRef}
        data-member-panel
        role="complementary"
        aria-label={t`Member preview`}
        className={
          `fixed inset-y-0 right-0 z-drawer flex w-full flex-col overflow-hidden border-l border-ktip-sand-200 bg-ktip-cream shadow-hard sm:w-[50vw] sm:min-w-[30rem] sm:rounded-l-surface-lg ${
            closing ? 'animate-slide-out-right pointer-events-none' : 'animate-slide-in-right'
          }`
        }
      >
        {/* Condensed header. Present in the DOM at all times so it can fade
            rather than pop, and inert until the name has scrolled away. */}
        <div
          aria-hidden={!condensed}
          className={`neu-surface absolute inset-x-0 top-0 z-sticky flex items-center gap-3 border-b border-ktip-sand-200 bg-ktip-cream/90 px-gutter py-2 backdrop-blur-md transition-opacity duration-200 ${
            condensed ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          {profile && (
            <>
              <DiamondAvatar src={profile.avatar_url} name={displayName} size={34} />
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-display text-body font-bold text-ktip-sand-900">
                  {displayName}
                </span>
                {profile.is_verified && (
                  <CheckCircle
                    size={14}
                    className="shrink-0 text-ktip-ocean-500"
                    aria-label={t`Verified`}
                  />
                )}
              </span>
            </>
          )}
          <button
            onClick={closeMember}
            aria-label={t`Close member preview`}
            className="ml-auto rounded-control p-1.5 text-ktip-sand-500 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-sand-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* Floats over the cover while the condensed header is hidden. */}
        <button
          onClick={closeMember}
          aria-label={t`Close member preview`}
          className={`absolute right-4 top-4 z-raised rounded-control bg-brand-navy/25 p-2 text-white backdrop-blur-sm transition-opacity hover:bg-brand-navy/45 ${
            condensed ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <X size={16} />
        </button>

        <div className="@container min-h-0 flex-1 overflow-y-auto">
          {/* Cover: a texture band, not a subject — the wash keeps type legible.
              The member's own banner (a teaser field, so it survives the
              privacy lock) replaces the seeded art when they have set one.
              Taller than it was, and faded into the surface at the bottom, so
              the avatar sits on a gradient rather than across a hard seam. */}
          <div className="relative h-40 shrink-0 overflow-hidden">
            {isGradientBanner(coverBanner) ? (
              <BannerAurora spec={coverBanner} />
            ) : (
              <img
                src={bannerImage(coverBanner) || heroImageFor(coverSeed)}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: bannerPosition(coverBanner, 'panel') }}
              />
            )}
            {/* Same rule as BentoCard: no wash over the aurora, a neutral
                scrim over chosen banner art, the seeded brand wash only over
                seeded stock photos. */}
            {!isGradientBanner(coverBanner) && (
              <div
                className={`absolute inset-0 bg-gradient-to-br ${
                  bannerImage(coverBanner) ? BANNER_WASH : gradientFor(coverSeed)
                }`}
              />
            )}
            <p className="absolute left-gutter top-4 text-micro font-semibold uppercase tracking-[0.2em] text-white/75">
              <Trans>Member</Trans>
            </p>
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-ktip-cream" />
          </div>

          {/* A signed-out visitor gets the list, not the people in it. The
              prompt carries `from` so signing in returns to this card. */}
          {!signedIn ? (
            <div className="px-gutter py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ktip-sand-100 shadow-neu-sm-inset">
                <Lock size={22} className="text-ktip-sand-500" aria-hidden="true" />
              </div>
              <h2 className="mt-4 font-display text-title-sm font-bold text-ktip-sand-900">
                <Trans>Sign in to view this member</Trans>
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-caption text-ktip-sand-600">
                <Trans>Member profiles and messages are for members of the network. Joining takes a minute.</Trans>
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link to="/login" state={{ from: { pathname, search: window.location.search } }}>
                  <Button size="sm"><Trans>Sign in</Trans></Button>
                </Link>
                <Link to="/register">
                  <Button variant="outline" size="sm">
                    <Trans>Create an account</Trans>
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* ---------- Identity ---------- */}
              <div className="px-gutter pb-5">
                <IdentityPlate
                  variant="panel"
                  loading={loading || !profile}
                  name={displayName}
                  avatarUrl={profile?.avatar_url}
                  verified={profile?.is_verified}
                  roles={profile?.roles}
                  standing={
                    stats && stats.badge_count > 0 ? (
                      <StandingMeter
                        rank={stats.rank}
                        points={stats.points}
                        badgeCount={stats.badge_count}
                        connectionCount={connectionCount}
                        streakDays={stats.streak_days}
                      />
                    ) : null
                  }
                />

                {profile && (
                  <ProfileFacts
                    className="mt-5"
                    items={[
                      !!profile.country && { label: t`Location`, value: profile.country },
                      !!profile.organization && {
                        label: t`Organization`,
                        value: profile.organization,
                      },
                      !!profile.industry && { label: t`Industry`, value: profile.industry },
                      { label: t`Joined`, value: formatDate(profile.created_at) },
                    ]}
                  />
                )}
              </div>

              {/* Handoff marker for the condensed header. */}
              <div ref={sentinelRef} aria-hidden className="h-px" />

              {loading || !profile ? (
                <div className="space-y-3 p-gutter">
                  <div className="h-24 animate-pulse-soft rounded-surface bg-ktip-sand-100" />
                  <div className="h-32 animate-pulse-soft rounded-surface bg-ktip-sand-100" />
                </div>
              ) : canView === false ? (
                /* Every section below is fed by a query that was never issued.
                   Say why, and leave the Connect button in the footer to act on. */
                <div className="px-gutter py-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ktip-sand-100 shadow-neu-sm-inset">
                    <Lock size={22} className="text-ktip-sand-500" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-title-sm font-bold text-ktip-sand-900">
                    <Trans>This profile is private</Trans>
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-caption text-ktip-sand-600">
                    <Trans>
                      Only {firstName}'s connections can see their full profile or send them a
                      message. Send a connection request to ask.
                    </Trans>
                  </p>
                  <Link to={memberPath(profile)} onClick={closeMember} className="mt-4 inline-block">
                    <Button variant="ghost" size="sm">
                      <Trans>Open member page</Trans>
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  {/* The lock never applies to yourself, an admin, or an
                      accepted connection (can_view_profile, 083). Say so —
                      otherwise locking your own profile looks broken when you
                      test it by opening your own card. */}
                  {isPrivate && (
                    <div className="mx-gutter mb-1 flex items-start gap-2.5 rounded-surface bg-ktip-sand-100 px-4 py-3 shadow-neu-sm-inset">
                      <Lock size={15} className="mt-0.5 shrink-0 text-ktip-sand-500" aria-hidden="true" />
                      <p className="text-micro leading-relaxed text-ktip-sand-600">
                        {isSelf ? (
                          <Trans>
                            Your profile is locked. Other members see only your name, photo and
                            country until you accept their connection request — you always see
                            everything here.
                          </Trans>
                        ) : auth.isAdmin ? (
                          <Trans>
                            This profile is private. You can see it because administrators
                            bypass the lock.
                          </Trans>
                        ) : (
                          <Trans>
                            This profile is private. You can see it because you are connected.
                          </Trans>
                        )}
                      </p>
                    </div>
                  )}

                  {profile.bio && (
                    <ProfileSection tone="flush" title={t`About`}>
                      <p className="whitespace-pre-wrap text-caption leading-relaxed text-ktip-sand-700">
                        {profile.bio}
                      </p>
                    </ProfileSection>
                  )}

                  {badges?.length ? (
                    <ProfileSection
                      tone="flush"
                      title={t`Achievements`}
                      count={badges.length}
                    >
                      <TrophyShelf
                        badges={badges}
                        assetMap={assetMap}
                        max={SHELF_MAX}
                        moreHref={memberPath(profile)}
                        size={48}
                      />
                    </ProfileSection>
                  ) : null}

                  {profile.skills?.length ? (
                    <ProfileSection tone="flush" title={t`Skills`}>
                      <ProfileTags values={profile.skills} tone="ocean" />
                    </ProfileSection>
                  ) : null}

                  {profile.interests?.length ? (
                    <ProfileSection tone="flush" title={t`Interests`}>
                      <ProfileTags values={profile.interests} tone="tropical" />
                    </ProfileSection>
                  ) : null}

                  {profile.open_to?.length ? (
                    <ProfileSection tone="flush" title={t`Open to`}>
                      <ProfileTags
                        values={profile.open_to}
                        tone="sun"
                        toneFor={(value) => (value === COLLAB_EXCLUSIVE_VALUE ? 'muted' : 'sun')}
                        labelFor={(value) => COLLABORATION_LABELS[value] || value}
                        icon={<Handshake size={12} aria-hidden="true" />}
                      />
                    </ProfileSection>
                  ) : null}

                  {projects?.length ? (
                    <ProfileSection tone="flush" title={t`Projects`} count={projects.length}>
                      <div className="grid">
                        {projects.map((project) => (
                          <ProfileLinkRow
                            key={project.id}
                            to={entityPath('project', project)}
                            label={project.title}
                            image={project.image_url}
                            icon={<FolderKanban size={16} aria-hidden="true" />}
                            meta={resolveCopy(i18n, PHASE_LABELS[project.phase])}
                          />
                        ))}
                      </div>
                    </ProfileSection>
                  ) : null}

                  {events?.length ? (
                    <ProfileSection tone="flush" title={t`Events`} count={events.length}>
                      <div className="grid">
                        {events.map((event) => (
                          <ProfileLinkRow
                            key={event.id}
                            to={entityPath('event', event)}
                            label={event.title}
                            image={event.image_url}
                            icon={<Calendar size={16} aria-hidden="true" />}
                            meta={event.start_date ? formatDate(event.start_date) : undefined}
                          />
                        ))}
                      </div>
                    </ProfileSection>
                  ) : null}

                  {/* A profile with nothing under the identity block looks
                      broken, so say why */}
                  {!hasSections && (
                    <div className="px-gutter py-10 text-center">
                      <Calendar size={20} className="mx-auto mb-2 text-ktip-sand-300" />
                      <p className="text-caption text-ktip-sand-500">
                        <Trans>{firstName} hasn't filled out a profile yet.</Trans>
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* ---------- Pinned actions ----------
            Always reachable, however far the content has scrolled. */}
        {showFooter && profile && (
          <div className="flex items-center gap-2 border-t border-ktip-sand-200 bg-ktip-cream px-gutter py-3">
            {!isSelf && (
              <>
                <ConnectButton otherUserId={profile.id} size="sm" />
                {/* A private member is unreachable until they accept —
                    offering the button would only produce an RLS error.
                    Same reasoning for dm:initiate, which students never
                    hold: 064 blocks the insert inside has_permission()
                    before the matrix is read, so the button could only
                    ever fail. See src/lib/venue-actions.ts, which makes
                    the same call for the venue surfaces. */}
                {canView && auth.can('dm:initiate') && !dmBlocked && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<MessageSquare size={14} />}
                    onClick={() => openPanel({ userId: profile.id })}
                  >
                    <Trans>Message</Trans>
                  </Button>
                )}
                <Link
                  to={`/grievances/report/${profile.id}`}
                  aria-label={t`Report`}
                  title={t`Report`}
                  className="rounded-control p-2 text-ktip-sand-400 transition-colors hover:text-red-600"
                >
                  <Flag size={14} />
                </Link>
              </>
            )}

            {/* The drawer stays the in-app default; this is the way out
                to a URL that can be shared. */}
            <Link
              to={memberPath(profile)}
              className="ml-auto inline-flex items-center gap-1 text-micro font-bold text-ktip-ocean-600 transition-all hover:gap-1.5 hover:text-ktip-ocean-700"
            >
              <Trans>View full profile</Trans>
              <ChevronRight size={13} />
            </Link>
          </div>
        )}

        {/* The DM block is an explanation, not a control, so it sits under the
            action row rather than replacing a button inside it. */}
        {showFooter && !isSelf && canView && dmBlocked && (
          <p className="border-t border-ktip-sand-200 bg-ktip-sand-50 px-gutter py-2 text-micro text-ktip-sand-500">
            {dmBlocked}
          </p>
        )}
      </section>
    </>
  )
}
