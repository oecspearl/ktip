import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import {
  Calendar,
  CheckCircle,
  ChevronRight,
  Flag,
  Lock,
  MessageSquare,
  X,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { AchievementBadge } from '../ui/AchievementBadge'
import { ConnectButton } from './ConnectButton'
import { useProfileId, useProfileView, useUserProjects, useUserEvents } from '../../hooks/useProfile'
import { useUserBadges } from '../../hooks/useBadges'
import { useConnectionCount } from '../../hooks/useConnections'
import { useProfileStats } from '../../hooks/useProfileStats'
import { useMemberPanel } from '../../contexts/MemberPanelContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { useAuth } from '../../contexts/AuthContext'
import { dmBlockedReason } from '../../lib/minor-safety'
import { heroImageFor, gradientFor } from '../../lib/hero-images'
import { BANNER_WASH, bannerImage, bannerPosition, isGradientBanner, parseBanner } from '../../lib/banner'
import { BannerAurora } from '../profile/BannerAurora'
import {
  ROLE_LABELS,
  ROLE_COLORS,
  COLLABORATION_LABELS,
  COLLAB_EXCLUSIVE_VALUE,
} from '../../lib/constants'
import { formatDate, cn } from '../../lib/utils'
import { entityPath, memberPath } from '../../lib/slug'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

/** Squarer than the app default — the drawer reads as a document, not pills. */
const CHIP = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border'
/** Applied to shared Badge/AchievementBadge so their pills match the chips. */
const SQUARE_PILL = 'rounded-md'

/** Titled block: green tick, heading, hairline above. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="px-6 py-6 border-t border-ktip-sand-100 first:border-t-0">
      <h3 className="flex items-center gap-2 text-base font-display font-bold text-ktip-sand-900 mb-3">
        <span aria-hidden className="w-1 h-4 rounded-sm bg-brand-green" />
        {label}
      </h3>
      {children}
    </section>
  )
}

/** One label/value pair in the identity rail's fact list. */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ktip-sand-400">
        {label}
      </dt>
      <dd className="text-sm font-medium text-ktip-sand-800 mt-0.5">{value}</dd>
    </div>
  )
}

/** Compact link row used for projects and events. */
function LinkRow({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between gap-3 px-3 py-2.5 -mx-3 rounded-lg text-sm text-ktip-sand-700 hover:bg-ktip-sand-50 hover:text-ktip-ocean-700 transition-colors"
    >
      <span className="truncate">{label}</span>
      <ChevronRight
        size={15}
        className="shrink-0 text-ktip-sand-300 group-hover:text-ktip-ocean-500 group-hover:translate-x-0.5 transition-all"
      />
    </Link>
  )
}

/**
 * Read-only member preview, opened from anywhere a member's name appears.
 * Replaces the old /profile/:id page — see MemberPanelContext. Slides in from
 * the right edge over the whole page, dimmed backdrop behind it; closes via X,
 * Escape, the backdrop, or an outside click.
 * z-drawer sits above the navbar but under Modal and the FAB
 * so a dialog opened from the drawer still layers on top.
 *
 * Layout is a profile page, not a stack of rows: an identity rail (avatar,
 * facts, actions) beside the narrative sections. Container queries — not
 * viewport breakpoints — split the columns, because the drawer is 45vw and only
 * it knows whether it is wide enough.
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

  return (
    <>
      {/* Dims the page so the drawer reads as the foreground layer */}
      <div
        aria-hidden
        data-member-scrim
        onClick={closeMember}
        className={cn(
          // Stays clickable while closing on purpose: the mousedown that
          // closed the drawer is followed by a click at mouseup, and with the
          // scrim gone (or pointer-inert) that click lands on whatever card
          // sits under the cursor and re-opens the drawer.
          'fixed inset-0 z-scrim bg-brand-navy/45 backdrop-blur-[3px]',
          closing ? 'animate-fade-out' : 'animate-fade-in'
        )}
      />
      <section
        ref={panelRef}
        data-member-panel
        role="complementary"
        aria-label={t`Member preview`}
        className={cn(
          'fixed z-drawer inset-y-0 right-0 w-full sm:w-[45vw] sm:min-w-[420px]',
          'bg-ktip-cream shadow-hard border-l border-ktip-sand-200 sm:rounded-l-2xl',
          'overflow-hidden flex flex-col',
          closing ? 'animate-slide-out-right pointer-events-none' : 'animate-slide-in-right'
        )}
      >
        {/* Floats over both the cover photo and the cream below it, so it stays
            reachable no matter how far the content has scrolled */}
        <button
          onClick={closeMember}
          aria-label={t`Close member preview`}
          className="absolute top-4 right-4 z-20 p-2 rounded-lg bg-brand-navy/25 hover:bg-brand-navy/45 backdrop-blur-sm text-white transition-colors"
        >
          <X size={16} />
        </button>

        <div className="@container flex-1 min-h-0 overflow-y-auto">
          {/* Cover: a texture band, not a subject — the wash keeps type legible.
              The member's own banner (a teaser field, so it survives the
              privacy lock) replaces the seeded art when they have set one. */}
          <div className="relative h-24 shrink-0 overflow-hidden">
            {isGradientBanner(coverBanner) ? (
              <BannerAurora spec={coverBanner} />
            ) : (
              <img
                src={bannerImage(coverBanner) || heroImageFor(coverSeed)}
                alt=""
                loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover"
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
            <p className="absolute left-6 top-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75">
              <Trans>Member</Trans>
            </p>
          </div>

          {/* A signed-out visitor gets the list, not the people in it. The
              prompt carries `from` so signing in returns to this card. */}
          {!signedIn ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ktip-sand-100">
                <Lock size={22} className="text-ktip-sand-500" aria-hidden="true" />
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-ktip-sand-900">
                <Trans>Sign in to view this member</Trans>
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ktip-sand-600">
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
          /* Stretched rows, so the rail's divider runs the full column height */
          <div className="@[46rem]:grid @[46rem]:grid-cols-[17rem_1fr]">
            {/* === Identity rail === */}
            {/* relative lifts it over the cover — the cover is positioned, so a
                static sibling would paint underneath it */}
            <aside className="relative px-6 pb-6 @[46rem]:border-r @[46rem]:border-ktip-sand-100">
              <DiamondAvatar
                src={profile?.avatar_url}
                name={profile ? displayName : ''}
                size={80}
                colorClass={profile ? undefined : 'bg-ktip-sand-300'}
                className="-mt-10"
                frameClassName="ring-4 ring-ktip-cream shadow-soft"
              />

              {!profile ? (
                <div className="space-y-2 mt-4">
                  <div className="h-6 w-40 rounded-md bg-ktip-sand-100 animate-pulse-soft" />
                  <div className="h-4 w-28 rounded-md bg-ktip-sand-100 animate-pulse-soft" />
                  <div className="h-24 w-full rounded-lg bg-ktip-sand-100 animate-pulse-soft" />
                </div>
              ) : (
                <>
                  <h2 className="flex items-start gap-2 text-2xl font-display font-bold text-ktip-sand-900 leading-tight mt-4">
                    <span className="min-w-0 break-words">{displayName}</span>
                    {profile.is_verified && (
                      <CheckCircle
                        size={18}
                        className="text-ktip-ocean-500 shrink-0 mt-1.5"
                        aria-label={t`Verified`}
                      />
                    )}
                  </h2>

                  {profile.roles?.length ? (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {profile.roles.map((role) => (
                        <Badge
                          key={role}
                          size="sm"
                          className={cn(ROLE_COLORS[role], SQUARE_PILL)}
                        >
                          {resolveCopy(i18n, ROLE_LABELS[role] || role)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  {/* Facts, not sentences — scannable in one pass */}
                  <dl className="grid grid-cols-2 @[46rem]:grid-cols-1 gap-x-4 gap-y-3.5 mt-5 pt-5 border-t border-ktip-sand-100">
                    {profile.country && <Fact label={t`Location`} value={profile.country} />}
                    {profile.organization && (
                      <Fact label={t`Organization`} value={profile.organization} />
                    )}
                    {profile.industry && <Fact label={t`Industry`} value={profile.industry} />}
                    {connectionCount !== null && (
                      <Fact
                        label={t`Connections`}
                        value={`${connectionCount} ${connectionCount === 1 ? 'member' : 'members'}`}
                      />
                    )}
                    {/* Omitted entirely at zero: "Newcomer · 0 points" on a new
                        member reads as a scoreboard of failure. */}
                    {stats && stats.badge_count > 0 && (
                      <Fact
                        label={t`Standing`}
                        value={`${stats.rank.name} · ${stats.points} pts`}
                      />
                    )}
                    <Fact label={t`Joined`} value={formatDate(profile.created_at)} />
                  </dl>

                  {/* Actions — hidden when you somehow land on yourself */}
                  {!isSelf && (
                    <div className="flex flex-wrap items-center gap-2 mt-5 pt-5 border-t border-ktip-sand-100">
                      <ConnectButton otherUserId={profile.id} size="sm" />
                      {/* A private member is unreachable until they accept —
                          offering the button would only produce an RLS error.
                          Same reasoning for dm:initiate, which students never
                          hold: 064 blocks the insert inside has_permission()
                          before the matrix is read, so the button could only
                          ever fail. See src/lib/venue-actions.ts, which makes
                          the same call for the venue surfaces. */}
                      {canView && auth.can('dm:initiate') && (
                        dmBlocked ? (
                          <p className="text-xs text-ktip-sand-500 max-w-xs">{dmBlocked}</p>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<MessageSquare size={14} />}
                            onClick={() => openPanel({ userId: profile.id })}
                          >
                            <Trans>Message</Trans>
                          </Button>
                        )
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-4">
                    {/* The drawer stays the in-app default; this is the way out
                        to a URL that can be shared. */}
                    <Link
                      to={memberPath(profile)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:gap-1.5 transition-all"
                    >
                      <Trans>View full profile</Trans>
                      <ChevronRight size={13} />
                    </Link>
                    {!isSelf && (
                      <Link
                        to={`/grievances/report/${profile.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-ktip-sand-400 hover:text-red-600 transition-colors ml-auto"
                      >
                        <Flag size={12} />
                        <Trans>Report</Trans>
                      </Link>
                    )}
                  </div>
                </>
              )}
            </aside>

            {/* === Narrative column === */}
            <div className="border-t border-ktip-sand-100 @[46rem]:border-t-0">
              {loading || !profile ? (
                <div className="p-6 space-y-3">
                  <div className="h-24 rounded-lg bg-ktip-sand-100 animate-pulse-soft" />
                  <div className="h-32 rounded-lg bg-ktip-sand-100 animate-pulse-soft" />
                </div>
              ) : canView === false ? (
                /* Every section below is fed by a query that was never issued.
                   Say why, and leave the Connect button in the rail to act on. */
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ktip-sand-100">
                    <Lock size={22} className="text-ktip-sand-500" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold text-ktip-sand-900">
                    <Trans>This profile is private</Trans>
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-ktip-sand-600">
                    {(() => {
                      const firstName = displayName.split(' ')[0]
                      return (
                        <Trans>
                          Only {firstName}'s connections can see their full profile or send them a
                          message. Send a connection request to ask.
                        </Trans>
                      )
                    })()}
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
                    <div className="mx-6 mt-6 flex items-start gap-2.5 rounded-lg border border-ktip-sand-200 bg-ktip-sand-50 px-4 py-3">
                      <Lock size={15} className="mt-0.5 shrink-0 text-ktip-sand-500" aria-hidden="true" />
                      <p className="text-xs leading-relaxed text-ktip-sand-600">
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
                    <Section label={t`About`}>
                      <p className="text-sm leading-relaxed text-ktip-sand-700 whitespace-pre-wrap">
                        {profile.bio}
                      </p>
                    </Section>
                  )}

                  {badges?.length ? (
                    <Section label={t`Achievements`}>
                      <div className="flex flex-wrap gap-2">
                        {badges.map((userBadge) => (
                          <AchievementBadge
                            key={userBadge.id}
                            userBadge={userBadge}
                            className={SQUARE_PILL}
                          />
                        ))}
                      </div>
                    </Section>
                  ) : null}

                  {profile.skills?.length ? (
                    <Section label={t`Skills`}>
                      <div className="flex flex-wrap gap-2">
                        {profile.skills.map((skill) => (
                          <span
                            key={skill}
                            className={cn(
                              CHIP,
                              'bg-ktip-ocean-50 text-ktip-ocean-700 border-ktip-ocean-100'
                            )}
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </Section>
                  ) : null}

                  {profile.interests?.length ? (
                    <Section label={t`Interests`}>
                      <div className="flex flex-wrap gap-2">
                        {profile.interests.map((interest) => (
                          <span
                            key={interest}
                            className={cn(
                              CHIP,
                              'bg-ktip-tropical-50 text-ktip-tropical-700 border-ktip-tropical-100'
                            )}
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                    </Section>
                  ) : null}

                  {profile.open_to?.length ? (
                    <Section label={t`Open to`}>
                      <div className="flex flex-wrap gap-2">
                        {profile.open_to.map((value) => (
                          <span
                            key={value}
                            className={cn(
                              CHIP,
                              value === COLLAB_EXCLUSIVE_VALUE
                                ? 'bg-ktip-sand-50 text-ktip-sand-500 border-ktip-sand-200'
                                : 'bg-ktip-sun-50 text-ktip-sand-800 border-ktip-sun-200'
                            )}
                          >
                            {COLLABORATION_LABELS[value] || value}
                          </span>
                        ))}
                      </div>
                    </Section>
                  ) : null}

                  {/* Compact rows, not cards — the column is too narrow for them */}
                  {projects?.length ? (
                    <Section label={t`Projects`}>
                      <div className="space-y-0.5">
                        {projects.map((project) => (
                          <LinkRow
                            key={project.id}
                            to={entityPath('project', project)}
                            label={project.title}
                          />
                        ))}
                      </div>
                    </Section>
                  ) : null}

                  {events?.length ? (
                    <Section label={t`Events`}>
                      <div className="space-y-0.5">
                        {events.map((event) => (
                          <LinkRow
                            key={event.id}
                            to={entityPath('event', event)}
                            label={event.title}
                          />
                        ))}
                      </div>
                    </Section>
                  ) : null}

                  {/* A rail with nothing beside it looks broken, so say why */}
                  {!hasSections && (
                    <div className="px-6 py-10 text-center">
                      <Calendar size={20} className="mx-auto text-ktip-sand-300 mb-2" />
                      <p className="text-sm text-ktip-sand-500">
                        {(() => {
                          const firstName = displayName.split(' ')[0]
                          return <Trans>{firstName} hasn't filled out a profile yet.</Trans>
                        })()}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          )}
        </div>
      </section>
    </>
  )
}
