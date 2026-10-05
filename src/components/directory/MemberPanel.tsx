import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowUpRight, ChevronRight, Flag, Lock, Mail, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { VerifiedBadge } from '../ui/VerifiedBadge'
import { ConnectButton } from './ConnectButton'
import { useProfileId, useProfileView, useUserProjects, useUserEvents } from '../../hooks/useProfile'
import { useUserBadges } from '../../hooks/useBadges'
import { useConnectionCount } from '../../hooks/useConnections'
import { useProfileStats } from '../../hooks/useProfileStats'
import {
  hiddenSections,
  privateSections,
  PROFILE_SECTIONS,
  sectionExceptions,
} from '../../lib/profile-visibility'
import type { ProfileSectionKey } from '../../types'
import { useTrophyAssets } from '../../hooks/useAchievements'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { useAuth } from '../../contexts/AuthContext'
import { dmBlockedReason } from '../../lib/minor-safety'
import { parseBanner } from '../../lib/banner'
import { parseAvatarStyle } from '../../lib/avatar-backdrop'
import { lookAttributes, parseProfileLook, resolveAlign } from '../../lib/profile-look'
import { TIER_LABEL } from '../../lib/achievement-style'
import {
  COLLABORATION_LABELS,
  COLLAB_EXCLUSIVE_VALUE,
  PHASE_LABELS,
  ROLE_LABELS,
} from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import { entityPath, memberPath } from '../../lib/slug'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { TrophyImage } from '../achievements/TrophyImage'
import { ProfileHero, type HeroStat } from '../profile/editorial/ProfileHero'
import { ledeFrom } from '../profile/ProfileCanvas'
import '../profile/editorial/editorial.css'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

/** Trophies shown before the row collapses into a "+N" tile. */
const SHELF_MAX = 5

/**
 * Read-only member preview, opened from anywhere a member's name appears.
 * Replaces the old /profile/:id page — see MemberPanelContext. Slides in from
 * the right edge over the whole page, dimmed backdrop behind it; closes via X,
 * Escape, the backdrop, or an outside click.
 * z-drawer sits above the navbar but under Modal and the FAB
 * so a dialog opened from the drawer still layers on top.
 *
 * The member page at drawer size: the same editorial island (editorial.css)
 * in its phone layout — the portrait in its own card, the identity card over
 * it — wearing the member's own look (169), so opening a card and opening the
 * page show one person, not two designs.
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
  // One section at a time (162). Undefined disables a query outright, so a
  // closed section costs no request, and nothing is asked until the view has
  // said what is closed.
  const hidden = hiddenSections(profile)
  const everythingHidden = hidden.size === PROFILE_SECTIONS.length
  const idFor = (...sections: ProfileSectionKey[]) =>
    profile && sections.some((section) => !hidden.has(section)) ? resolvedId : undefined

  const { projects } = useUserProjects(idFor('projects'))
  const { events } = useUserEvents(idFor('events'))
  const { badges } = useUserBadges(idFor('achievements'))
  // null when this viewer isn't allowed to see the count (owner's setting)
  const { count: connectionCount } = useConnectionCount(idFor('standing'))
  // null for suspended accounts; the drawer just omits the figures then
  const { stats } = useProfileStats(idFor('standing'))
  // Trophy artwork, keyed type x tier. Cached under one key for the whole app,
  // so opening a second card costs nothing.
  const { assetMap } = useTrophyAssets()

  // Condensed header handoff: a 1px sentinel sits under the identity card, and
  // the header fades in once it scrolls out. An observer rather than a scroll
  // listener so nothing runs per frame while the drawer is being flung.
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
  // Your own card never hides anything from you, so what you have closed is
  // read off your own row rather than the view.
  const selfHasPrivate =
    isSelf &&
    privateSections(auth.profile?.profile_visibility, auth.profile?.section_visibility).length > 0
  const selfExceptions = isSelf
    ? sectionExceptions(auth.profile?.profile_visibility, auth.profile?.section_visibility)
    : 0
  // Explains itself rather than silently dropping the button: the panel is
  // where someone goes deliberately to contact a member, and a missing action
  // with no reason reads as a bug.
  const dmBlocked = dmBlockedReason(auth.profile, profile)
  const displayName = profile?.display_name || 'Unknown User'
  const firstName = displayName.split(' ')[0]

  // The member's look and portrait — teaser fields, so a private member's card
  // still wears them.
  const look = parseProfileLook(profile?.profile_look)
  const style = parseAvatarStyle(profile?.avatar_style)
  const lookAttrs = lookAttributes(look)
  const openTo = (profile?.open_to ?? []).filter((v) => v !== COLLAB_EXCLUSIVE_VALUE)
  const showStanding = !!stats?.rank && stats.badge_count > 0 && !hidden.has('standing')
  const heroStats: HeroStat[] = []
  if (showStanding && stats?.points != null) heroStats.push({ key: 'points', label: t`Points`, value: stats.points })
  if (stats && stats.badge_count > 0 && !hidden.has('achievements'))
    heroStats.push({ key: 'achievements', label: t`Achievements`, value: stats.badge_count })
  if (connectionCount != null) heroStats.push({ key: 'connections', label: t`Connections`, value: connectionCount })
  const joinedMonth = profile ? formatDate(profile.created_at, 'MMMM yyyy') : ''

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
  const shown = (badges ?? []).slice(0, SHELF_MAX)
  const overflow = (badges?.length ?? 0) - shown.length

  return (
    <>
      {/* Dims the page so the drawer reads as the foreground layer */}
      <div
        aria-hidden
        data-member-scrim
        data-lite-solid
        onClick={closeMember}
        className={
          // Stays clickable while closing on purpose: the mousedown that
          // closed the drawer is followed by a click at mouseup, and with the
          // scrim gone (or pointer-inert) that click lands on whatever card
          // sits under the cursor and re-opens the drawer.
          `fixed inset-0 z-scrim bg-brand-navy/45 backdrop-blur-[3px] [--lite-solid:color-mix(in_srgb,var(--color-brand-navy)_55%,transparent)] ${
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
          // 50vw with no ceiling: on a 2560px screen that is a 1280px drawer
          // holding one person's card. It is a preview, so it is capped at a
          // reading width and stops growing.
          // The bottom padding keeps the pinned footer off the home indicator
          // in an installed app; the cover is allowed under the status bar,
          // and the two close buttons below step down past it themselves.
          `fixed inset-y-0 right-0 z-drawer flex w-full flex-col overflow-hidden border-l border-ktip-sand-200 bg-ktip-cream shadow-hard pb-[env(safe-area-inset-bottom,0px)] sm:w-[50vw] sm:min-w-[30rem] sm:max-w-[40rem] sm:rounded-l-surface-lg ${
            closing ? 'animate-slide-out-right pointer-events-none' : 'animate-slide-in-right'
          }`
        }
      >
        {/* Condensed header. Present in the DOM at all times so it can fade
            rather than pop, and inert until the name has scrolled away. */}
        <div
          aria-hidden={!condensed}
          data-lite-solid
          className={`neu-surface absolute inset-x-0 top-0 z-sticky flex items-center gap-3 border-b border-ktip-sand-200 bg-ktip-cream/90 px-gutter pb-2 pt-[calc(var(--spacing)*2+env(safe-area-inset-top,0px))] backdrop-blur-md transition-opacity duration-200 [--lite-solid:var(--color-ktip-cream)] ${
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
                <VerifiedBadge verified={profile.is_verified} size={14} />
              </span>
            </>
          )}
          <button
            onClick={closeMember}
            aria-label={t`Close member preview`}
            className="icon-hit ml-auto rounded-control p-1.5 text-ktip-sand-500 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-sand-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* Floats over the photo card while the condensed header is hidden.
            Frosted light glass, the same as the card's own pills. */}
        <button
          onClick={closeMember}
          aria-label={t`Close member preview`}
          className={`icon-hit absolute right-7 top-[calc(var(--spacing)*7+env(safe-area-inset-top,0px))] z-raised rounded-full bg-white/75 p-2.5 text-ktip-ink shadow-sm backdrop-blur-md transition-opacity hover:bg-white ${
            condensed ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <X size={18} />
        </button>

        <div
          className="pf flex min-h-0 flex-1 flex-col"
          data-layout="panel"
          data-photo={lookAttrs['data-photo']}
          data-tone={lookAttrs['data-tone']}
          style={lookAttrs.style as CSSProperties}
        >
          <div className="min-h-0 flex-1 overflow-y-auto pt-[env(safe-area-inset-top,0px)]">
            <div className="pf-wrap pt-3.5">
              {/* A signed-out visitor gets the list, not the people in it. The
                  prompt carries `from` so signing in returns to this card. */}
              {!signedIn ? (
                <div className="pf-card pf-lock">
                  <Lock size={22} aria-hidden="true" />
                  <h2>
                    <Trans>Sign in to view this member</Trans>
                  </h2>
                  <p>
                    <Trans>Member profiles and messages are for members of the network. Joining takes a minute.</Trans>
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <Link to="/login" state={{ from: { pathname, search: window.location.search } }}>
                      <Button size="sm">
                        <Trans>Sign in</Trans>
                      </Button>
                    </Link>
                    <Link to="/register">
                      <Button variant="outline" size="sm">
                        <Trans>Create an account</Trans>
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : loading || !profile ? (
                <div className="space-y-3">
                  <div className="h-[26rem] animate-pulse-soft rounded-surface-lg bg-ktip-sand-100" />
                  <div className="h-32 animate-pulse-soft rounded-surface bg-ktip-sand-100" />
                </div>
              ) : (
                <>
                  {/* ---------- Identity: photo card + identity card ---------- */}
                  <ProfileHero
                    name={displayName}
                    verified={profile.is_verified}
                    roleLabels={(profile.roles ?? []).map((role) => resolveCopy(i18n, ROLE_LABELS[role] || role))}
                    tagline={profile.tagline?.trim() || [profile.organization, profile.industry].filter(Boolean).join(' · ') || null}
                    bio={ledeFrom(profile.bio)}
                    country={profile.country}
                    orgName={profile.organization}
                    openTo={null}
                    joinedYear={String(new Date(profile.created_at).getFullYear())}
                    joinedLabel={t`Joined ${joinedMonth}`}
                    avatarUrl={profile.avatar_url}
                    style={style}
                    banner={parseBanner(profile.banner)}
                    align={resolveAlign(look, style)}
                    stats={heroStats}
                    standing={
                      showStanding && stats?.rank
                        ? {
                            level: stats.rank.level,
                            name: stats.rank.name,
                            earned: stats.rank.earned,
                            nextRequired: stats.rank.next_required,
                            nextName: stats.rank.next_name,
                          }
                        : null
                    }
                    variant="panel"
                  />

                  {/* Handoff marker for the condensed header. */}
                  <div ref={sentinelRef} aria-hidden className="h-px" />

                  {canView === false && everythingHidden ? (
                    /* Every section below is fed by a query that was never issued.
                       Say why, and leave the Connect button in the footer to act on. */
                    <div className="pf-card pf-lock mt-3.5">
                      <Lock size={22} aria-hidden="true" />
                      <h2>
                        <Trans>This profile is private</Trans>
                      </h2>
                      <p>
                        <Trans>
                          Only {firstName}'s connections can see their full profile or send them a
                          message. Send a connection request to ask.
                        </Trans>
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* A viewer who gets some sections and not others (162):
                          say so in one line, so the gaps do not read as a member
                          who never filled them in. */}
                      {!isSelf && hidden.size > 0 && (
                        <p className="pf-notice mt-3.5">
                          <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {canView === false ? (
                            <Trans>
                              Only {firstName}'s connections can see their full profile or send them
                              a message. Send a connection request to ask.
                            </Trans>
                          ) : (
                            <Trans>Some of {firstName}'s profile is for their connections only.</Trans>
                          )}
                        </p>
                      )}

                      {/* The lock never applies to yourself, an admin, or an
                          accepted connection (can_view_profile, 083). Say so —
                          otherwise locking your own profile looks broken when you
                          test it by opening your own card. */}
                      {(selfHasPrivate || (!isSelf && isPrivate && canView !== false)) && (
                        <p className="pf-notice mt-3.5">
                          <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {isSelf ? (
                            isPrivate && selfExceptions === 0 ? (
                              <Trans>
                                Your profile is locked. Other members see only your name, photo and
                                country until you accept their connection request — you always see
                                everything here.
                              </Trans>
                            ) : (
                              <Trans>
                                Some of your profile is for connections only. You always see all of
                                it here.
                              </Trans>
                            )
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
                      )}

                      {profile.bio && (
                        <article className="pf-card mt-3.5">
                          <p className="pf-eyebrow">
                            <Trans>About</Trans>
                          </p>
                          <p className="pf-about-text">{profile.bio}</p>
                        </article>
                      )}

                      {openTo.length > 0 && (
                        <article className="pf-card pf-card--dark pf-opento mt-3.5">
                          <p className="pf-eyebrow">
                            <Trans>Open to</Trans>
                          </p>
                          <ol className="mb-0!">
                            {openTo.map((value, i) => (
                              <li key={value}>
                                <span className="pf-num">{String(i + 1).padStart(2, '0')}</span>
                                {COLLABORATION_LABELS[value] || value}
                              </li>
                            ))}
                          </ol>
                        </article>
                      )}

                      {badges?.length ? (
                        <section className="pf-dsec">
                          <div className="pf-sechead">
                            <h2>
                              <Trans>Achievements</Trans>
                            </h2>
                            <span className="pf-eyebrow">{badges.length}</span>
                          </div>
                          <div className="pf-dach">
                            {shown.map((ub) =>
                              ub.badge ? (
                                <div key={ub.id} className="pf-dtile">
                                  <TrophyImage
                                    icon={ub.badge.icon}
                                    trophyType={ub.badge.trophy_type}
                                    tier={ub.badge.tier}
                                    imageUrl={ub.badge.image_url}
                                    rarity={ub.badge.rarity}
                                    assetMap={assetMap}
                                    name={ub.badge.name}
                                    size={44}
                                  />
                                  <span>{ub.badge.name}</span>
                                  {ub.badge.tier && <small>{resolveCopy(i18n, TIER_LABEL[ub.badge.tier])}</small>}
                                </div>
                              ) : null
                            )}
                            {overflow > 0 && (
                              <Link to={`${memberPath(profile)}?tab=achievements`} className="pf-dtile pf-dmore">
                                <b>+{overflow}</b>
                                <Trans>View all</Trans>
                              </Link>
                            )}
                          </div>
                        </section>
                      ) : null}

                      {profile.skills?.length ? (
                        <section className="pf-dsec">
                          <div className="pf-sechead">
                            <h2>
                              <Trans>Skills</Trans>
                            </h2>
                          </div>
                          <div className="pf-chips">
                            {profile.skills.map((skill) => (
                              <span key={skill} className="pf-chipl">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {profile.interests?.length ? (
                        <section className="pf-dsec">
                          <div className="pf-sechead">
                            <h2>
                              <Trans>Interests</Trans>
                            </h2>
                          </div>
                          <div className="pf-chips">
                            {profile.interests.map((interest) => (
                              <span key={interest} className="pf-chipl">
                                {interest}
                              </span>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {projects?.length ? (
                        <section className="pf-dsec">
                          <div className="pf-sechead">
                            <h2>
                              <Trans>Projects</Trans>
                            </h2>
                            <span className="pf-eyebrow">{projects.length}</span>
                          </div>
                          <div>
                            {projects.map((project) => (
                              <Link key={project.id} to={entityPath('project', project)} className="pf-dlink">
                                <span className="t">{project.title}</span>
                                <span className="s">{resolveCopy(i18n, PHASE_LABELS[project.phase] || project.phase)}</span>
                                <ChevronRight size={16} aria-hidden="true" />
                              </Link>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {events?.length ? (
                        <section className="pf-dsec">
                          <div className="pf-sechead">
                            <h2>
                              <Trans>Events</Trans>
                            </h2>
                            <span className="pf-eyebrow">{events.length}</span>
                          </div>
                          <div>
                            {events.map((event) => (
                              <Link key={event.id} to={entityPath('event', event)} className="pf-dlink">
                                <span className="t">{event.title}</span>
                                {event.start_date && <span className="s">{formatDate(event.start_date, 'MMM d, yyyy')}</span>}
                                <ChevronRight size={16} aria-hidden="true" />
                              </Link>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {/* A profile with nothing under the identity card looks
                          broken, so say why — unless the empty space is closed
                          sections, which the notice above has already explained. */}
                      {!hasSections && hidden.size === 0 && (
                        <p className="pf-empty mx-auto py-8 text-center">
                          <Trans>{firstName} hasn't filled out a profile yet.</Trans>
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ---------- Pinned actions ----------
              Always reachable, however far the content has scrolled. The right
              margin is not decoration: the floating action button is z-fab,
              deliberately above z-drawer, and parks exactly where this row's
              last control would sit. */}
          {showFooter && profile && (
            <div className="pf-dfoot mr-[5.5rem]">
              {!isSelf && (
                <>
                  <ConnectButton otherUserId={profile.id} size="sm" tone="editorial-light" />
                  {/* A private member is unreachable until they accept —
                      offering the button would only produce an RLS error.
                      Same reasoning for dm:initiate, which students never
                      hold: 064 blocks the insert inside has_permission()
                      before the matrix is read, so the button could only
                      ever fail. See src/lib/venue-actions.ts, which makes
                      the same call for the venue surfaces. */}
                  {canView && auth.can('dm:initiate') && !dmBlocked && (
                    <button
                      type="button"
                      onClick={() => openPanel({ userId: profile.id })}
                      aria-label={t`Message ${displayName}`}
                      title={t`Message`}
                      className="pf-btn pf-btn--ghost-dark pf-btn--sm"
                    >
                      <Mail size={16} aria-hidden="true" />
                    </button>
                  )}
                  <Link
                    to={`/grievances/report/${profile.id}`}
                    aria-label={t`Report`}
                    title={t`Report`}
                    className="pf-btn pf-btn--sm flag"
                  >
                    <Flag size={15} aria-hidden="true" />
                  </Link>
                </>
              )}

              {/* The drawer stays the in-app default; this is the way out
                  to a URL that can be shared. */}
              <Link to={memberPath(profile)} className="grow">
                <Trans>View full profile</Trans>
                <ArrowUpRight size={15} className="pf-arrow" aria-hidden="true" />
              </Link>
            </div>
          )}

          {/* The DM block is an explanation, not a control, so it sits under the
              action row rather than replacing a button inside it. */}
          {showFooter && !isSelf && canView && dmBlocked && (
            <p className="px-gutter pb-3 text-micro text-ktip-sand-500">{dmBlocked}</p>
          )}
        </div>
      </section>
    </>
  )
}
