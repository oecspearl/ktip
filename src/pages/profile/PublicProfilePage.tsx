import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router'
import {
  Calendar,
  CheckCircle,
  Building2,
  ExternalLink,
  FileText,
  Flag,
  FolderKanban,
  Handshake,
  Lock,
  MessageSquare,
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
import { COLLABORATION_LABELS, COLLAB_EXCLUSIVE_VALUE, PHASE_LABELS } from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import { isOrganizationAccount } from '../../lib/permissions'
import { canDmAcrossAges } from '../../lib/minor-safety'
import { useEmployerForUser, useEmployerPortfolio } from '../../hooks/useEmployerProfile'
import { formatDate } from '../../lib/utils'
import { entityPath } from '../../lib/slug'
import { Trans, useLingui } from '@lingui/react/macro'
import { PageHero } from '../../components/layout/PageHero'
import { bannerImage, bannerPosition, isGradientBanner, parseBanner } from '../../lib/banner'
import { BannerAurora } from '../../components/profile/BannerAurora'
import { IdentityPlate, MetaDot } from '../../components/profile/IdentityPlate'
import { ProfileSection } from '../../components/profile/ProfileSection'
import { ProfileFacts } from '../../components/profile/ProfileFacts'
import { ProfileTags } from '../../components/profile/ProfileTags'
import { ProfileLinkRow } from '../../components/profile/ProfileLinkRow'
import { StandingMeter } from '../../components/profile/StandingMeter'
import { TrophyShelf } from '../../components/profile/TrophyShelf'

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
 * (bio, details, skills, employer) and a scrolling column holding the earned
 * "what" (trophies, projects, events). Below `lg` the rail stacks above the
 * content. The single narrow column it replaced left half of a widescreen
 * empty and gave six identical bordered cards nothing to be measured against.
 */
export default function PublicProfilePage() {
    const { t , i18n } = useLingui()
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
  const showcase = stats?.showcase || []
  // An organisation account's page leads with the business, not a CV it will
  // never have. Individual accounts are untouched.
  const isOrgAccount = isOrganizationAccount(profile.roles)
  const joinedDate = formatDate(profile.created_at)
  // Chrome around the connection-privacy notice — displayName is the member's
  // own name and is never translated, but the sentence around it is.
  const privateProfileMessage =
    connectionState === 'pending_sent'
      ? t`${displayName} has your connection request. Once they accept it you will see their full profile and be able to message them.`
      : connectionState === 'pending_received'
        ? t`${displayName} has asked to connect with you. Accept and you will both see each other's full profile.`
        : t`Only ${displayName}'s connections can see their full profile or send them a message. Send a connection request to ask.`

  const pageBanner = parseBanner(profile.banner)

  // Pinned trophies lead the shelf; the rest follow in the order they were
  // earned. A member who has chosen a showcase has said which ones matter.
  const pinnedIds = new Set(showcase.map((pin) => pin.badge.id))
  const shelfBadges = badges
    ? [
        ...badges.filter((b) => pinnedIds.has(b.badge_id)),
        ...badges.filter((b) => !pinnedIds.has(b.badge_id)),
      ]
    : []

  return (
    <>
    <PageHero
      compact
      backAlways
      eyebrow={t`Member`}
      title={
        <span className="inline-flex items-center gap-3">
          <span className="truncate">{displayName}</span>
          {profile.is_verified && (
            <span className="text-white/90 shrink-0" title={t`Verified member`}>
              <CheckCircle size={22} />
            </span>
          )}
        </span>
      }
      imageSeed={profile.id}
      image={bannerImage(pageBanner)}
      neutralWash={!!bannerImage(pageBanner)}
      imagePosition={bannerPosition(pageBanner, 'page')}
      background={isGradientBanner(pageBanner) ? <BannerAurora spec={pageBanner} /> : undefined}
      breadcrumb={[
        { label: t`Home`, href: '/' },
        { label: t`Member Directory`, href: '/directory' },
        { label: displayName },
      ]}
    />

    <div className="mx-auto max-w-page-mid px-4 pb-gutter-lg">
      {/* ---------- Identity ----------
          The plate overlaps the hero band, so the banner reads as this card's
          backdrop rather than as a stripe above a gap. */}
      <IdentityPlate
        id="profile"
        spy="Profile"
        name={displayName}
        avatarUrl={profile.avatar_url}
        verified={profile.is_verified}
        roles={profile.roles}
        meta={
          <>
            {profile.country && <span>{profile.country}</span>}
            {profile.country && (profile.organization || profile.industry) && <MetaDot />}
            {(profile.organization || profile.industry) && (
              <span>{[profile.organization, profile.industry].filter(Boolean).join(' · ')}</span>
            )}
            {(profile.country || profile.organization || profile.industry) && <MetaDot />}
            <span>
              <Trans>Joined {joinedDate}</Trans>
            </span>
          </>
        }
        actions={
          !isSelf && auth.user ? (
            <>
              <ConnectButton otherUserId={profile.id} />
              {/* A private member is unreachable until they accept. Showing the
                  button anyway would only produce a permission error from RLS. */}
              {/* And a 1:1 DM across the adult/minor line is refused by the
                  server (091), so the same reasoning applies. */}
              {canView && canDmAcrossAges(auth.profile, profile) && (
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
        }
        standing={
          stats && stats.badge_count > 0 ? (
            /* Keeps the tutorial's `[data-spy="Standing"]` anchor alive now
               that the standalone Standing card is gone. `data-spy-skip` keeps
               it off the scroll rail, where it would sit on top of Profile. */
            <div id="standing" data-spy="Standing" data-spy-skip className="scroll-mt-24">
              <StandingMeter
                rank={stats.rank}
                points={stats.points}
                badgeCount={stats.badge_count}
                connectionCount={connectionCount}
                streakDays={stats.streak_days}
              />
            </div>
          ) : null
        }
      />

      {/* ---------- Private ----------
          Everything below this point is driven by queries that were never
          issued when can_view is false, so they collapse on their own. This
          panel exists so the page says why rather than looking broken. */}
      {canView === false && (
        <section className="neu-surface mt-gutter rounded-surface bg-ktip-cream p-card-pad-lg text-center shadow-neu">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ktip-sand-100 shadow-neu-sm-inset">
            <Lock size={22} className="text-ktip-sand-500" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-title-sm font-bold text-ktip-sand-900">
            <Trans>This profile is private</Trans>
          </h2>
          <p className="mx-auto mt-2 max-w-md text-caption text-ktip-sand-600">
            {privateProfileMessage}
          </p>
          {/* No Connect button here. The plate directly above already carries
              one, and two of the same control a few hundred pixels apart reads
              as a rendering bug rather than as emphasis. */}
        </section>
      )}

      {canView !== false && (
        <div className="mt-gutter grid items-start gap-gutter lg:grid-cols-[20rem_1fr]">
          {/* ---------- The static "who" ----------
              Sticks while the column beside it scrolls, so the person stays on
              screen next to whatever you are reading about them. */}
          <div className="grid gap-card-gap lg:sticky lg:top-24">
            {/* The member-page tutorial anchors a step on `[data-spy="About"]`,
                so this marker travels with the bio rather than being dropped
                when there is none — the section itself still only renders when
                there is something to read. */}
            {profile.bio && (
              <ProfileSection id="about" spy="About" tone="rail" title={t`About`}>
                <p className="whitespace-pre-wrap text-caption leading-relaxed text-ktip-sand-700">
                  {profile.bio}
                </p>
              </ProfileSection>
            )}

            <ProfileSection tone="rail" title={t`Details`}>
              <ProfileFacts
                columns={1}
                items={[
                  !!profile.country && { label: t`Location`, value: profile.country },
                  !!profile.organization && {
                    label: t`Organization`,
                    value: profile.organization,
                  },
                  !!profile.industry && { label: t`Industry`, value: profile.industry },
                  { label: t`Joined`, value: joinedDate },
                ]}
              />
            </ProfileSection>

            {profile.skills?.length ? (
              <ProfileSection tone="rail" title={t`Skills`}>
                <ProfileTags values={profile.skills} tone="ocean" />
              </ProfileSection>
            ) : null}

            {profile.interests?.length ? (
              <ProfileSection tone="rail" title={t`Interests`}>
                <ProfileTags values={profile.interests} tone="tropical" />
              </ProfileSection>
            ) : null}

            {profile.open_to?.length ? (
              <ProfileSection tone="rail" title={t`Open to`}>
                <ProfileTags
                  values={profile.open_to}
                  tone="sun"
                  toneFor={(value) => (value === COLLAB_EXCLUSIVE_VALUE ? 'muted' : 'sun')}
                  labelFor={(value) => COLLABORATION_LABELS[value] || value}
                  icon={<Handshake size={12} aria-hidden="true" />}
                />
              </ProfileSection>
            ) : null}

            {/* ---------- Organisation ----------
                profiles.organization has always been free text that links
                nowhere. This is the registered entity behind it, with the work
                it publishes — the business equivalent of the CV an individual
                member gets. */}
            {employer && (
              <ProfileSection
                id="organisation"
                spy="Organisation"
                tone="rail"
                title={t`Organisation`}
              >
                <div className="flex items-start gap-3">
                  {employer.logo_url ? (
                    <img
                      src={employer.logo_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-control object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-ktip-ocean-100">
                      <Building2 size={20} className="text-ktip-ocean-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/org/${employer.slug}`}
                      className="flex items-center gap-1.5 font-display text-body font-bold text-ktip-sand-900 hover:text-ktip-ocean-600"
                    >
                      {employer.trading_name || employer.legal_name}
                      <ExternalLink size={13} aria-hidden="true" />
                    </Link>
                    {employer.industry && (
                      <p className="text-micro text-ktip-sand-500">{employer.industry}</p>
                    )}
                    {employer.description && (
                      <p className="mt-1.5 line-clamp-3 text-micro leading-relaxed text-ktip-sand-700">
                        {employer.description}
                      </p>
                    )}
                  </div>
                </div>

                {portfolio && portfolio.length > 0 && (
                  <div className="mt-4 border-t border-ktip-sand-200 pt-3">
                    <p className="mb-1.5 text-micro font-semibold uppercase tracking-[0.12em] text-ktip-sand-500">
                      <Trans>Portfolio</Trans>
                    </p>
                    <ul className="space-y-1">
                      {portfolio.slice(0, 4).map((item) => (
                        <li key={item.id} className="text-micro text-ktip-sand-700">
                          <span className="font-semibold">{item.title}</span>
                          {item.summary && (
                            <span className="text-ktip-sand-500"> — {item.summary}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {portfolio.length > 4 && (
                      <Link
                        to={`/org/${employer.slug}`}
                        className="mt-2 inline-block text-micro font-semibold text-ktip-ocean-600 hover:underline"
                      >
                        <Trans>All {portfolio.length} pieces of work</Trans>
                      </Link>
                    )}
                  </div>
                )}
              </ProfileSection>
            )}

            {/* Only rendered when the CV is actually published — see publicResume. */}
            {!isOrgAccount && publicResume && (
              <Link to={`/user/${routeParam}/cv`}>
                <Button variant="outline" fullWidth icon={<FileText size={16} />}>
                  <Trans>View CV</Trans>
                </Button>
              </Link>
            )}
          </div>

          {/* ---------- The earned "what" ---------- */}
          <div className="grid gap-card-gap">
            {shelfBadges.length > 0 && (
              <ProfileSection
                id="achievements"
                spy="Achievements"
                title={t`Achievements`}
                count={stats?.badge_count ?? shelfBadges.length}
                actions={
                  isSelf ? (
                    <Link to="/dashboard/achievements">
                      <Button variant="ghost" size="sm" icon={<Trophy size={14} />}>
                        <Trans>Manage your achievements</Trans>
                      </Button>
                    </Link>
                  ) : null
                }
              >
                <TrophyShelf
                  badges={shelfBadges}
                  assetMap={assetMap}
                  locked={lockedPreview}
                  moreHref="/achievements"
                />
              </ProfileSection>
            )}

            {projects?.length ? (
              <ProfileSection
                id="projects"
                spy="Projects"
                title={t`Projects`}
                count={projects.length}
              >
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
              <ProfileSection id="events" spy="Events" title={t`Events`} count={events.length}>
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
          </div>
        </div>
      )}
    </div>
    </>
  )
}
