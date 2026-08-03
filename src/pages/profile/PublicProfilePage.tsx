import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import {
  Briefcase,
  Calendar,
  CheckCircle,
  Building2,
  ExternalLink,
  FileText,
  Flag,
  FolderKanban,
  Flame,
  Handshake,
  Lock,
  MapPin,
  MessageSquare,
  Trophy,
  Users,
} from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { AchievementBadge } from '../../components/ui/AchievementBadge'
import { MiniTrophy } from '../../components/achievements/TrophyCard'
import { ConnectButton } from '../../components/directory/ConnectButton'
import { useProfileId, useProfileView, useUserProjects, useUserEvents } from '../../hooks/useProfile'
import { useConnectionStatus } from '../../hooks/useConnections'
import { useUserBadges } from '../../hooks/useBadges'
import { useConnectionCount } from '../../hooks/useConnections'
import { usePublicResume } from '../../hooks/useResume'
import { useProfileStats } from '../../hooks/useProfileStats'
import { useTrophyAssets, useTrackFlag } from '../../hooks/useAchievements'
import { useAuth } from '../../contexts/AuthContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useCanonicalSlug } from '../../hooks/useCanonicalSlug'
import {
  ROLE_LABELS,
  ROLE_COLORS,
  COLLABORATION_LABELS,
  COLLAB_EXCLUSIVE_VALUE,
} from '../../lib/constants'
import { isOrganizationAccount } from '../../lib/permissions'
import { canDmAcrossAges } from '../../lib/minor-safety'
import { useEmployerForUser, useEmployerPortfolio } from '../../hooks/useEmployerProfile'
import { formatDate } from '../../lib/utils'
import { entityPath } from '../../lib/slug'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

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

  // Powers the 'explorer' hidden achievement. Viewing your own page does not
  // count — that would be a free badge for reloading. Neither does bouncing
  // off a private one: there is nothing there to have explored.
  useEffect(() => {
    if (id && auth.user?.id && id !== auth.user.id && canView) trackFlag('directory_views')
  }, [id, auth.user?.id, canView, trackFlag])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 px-4 py-8">
        <div className="h-40 animate-pulse-soft rounded-3xl bg-ktip-sand-100" />
        <div className="h-64 animate-pulse-soft rounded-3xl bg-ktip-sand-100" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900"><Trans>Member not found</Trans></h1>
        <p className="mt-2 text-sm text-ktip-sand-600">
          <Trans>This profile does not exist, or is no longer available.</Trans>
        </p>
        <Link to="/directory" className="mt-4 inline-block">
          <Button variant="outline" size="sm"><Trans>Browse the directory</Trans></Button>
        </Link>
      </div>
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* ---------- Identity ---------- */}
      <header
        id="profile"
        data-spy="Profile"
        className="scroll-mt-24 rounded-3xl border border-ktip-sand-200 bg-ktip-cream p-6"
      >
        <div className="flex flex-wrap items-start gap-5">
          <DiamondAvatar src={profile.avatar_url} name={displayName} size={96} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold text-ktip-sand-900">{displayName}</h1>
              {profile.is_verified && (
                <span className="text-ktip-ocean-500" title={t`Verified member`}>
                  <CheckCircle size={20} />
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ktip-sand-600">
              {profile.country && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} aria-hidden="true" />
                  {profile.country}
                </span>
              )}
              {(profile.organization || profile.industry) && (
                <span className="flex items-center gap-1.5">
                  <Briefcase size={14} aria-hidden="true" />
                  {[profile.organization, profile.industry].filter(Boolean).join(' · ')}
                </span>
              )}
              {connectionCount !== null && (
                <span className="flex items-center gap-1.5">
                  <Users size={14} aria-hidden="true" />
                  <span className="font-semibold text-ktip-sand-900">{connectionCount}</span>
                  {connectionCount === 1 ? t`connection` : t`connections`}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar size={14} aria-hidden="true" />
                <Trans>Joined {joinedDate}</Trans>
              </span>
            </div>

            {profile.roles?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.roles.map((role) => (
                  <Badge key={role} className={ROLE_COLORS[role]}>
                    {resolveCopy(i18n, ROLE_LABELS[role] || role)}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Only rendered when the CV is actually published — see publicResume. */}
        {!isOrgAccount && publicResume && (
          <div className="mt-5">
            <Link to={`/user/${routeParam}/cv`}>
              <Button variant="outline" size="sm" icon={<FileText size={16} />}>
                <Trans>View CV</Trans>
              </Button>
            </Link>
          </div>
        )}

        {!isSelf && auth.user && (
          <div className="mt-5 flex flex-wrap gap-2">
            <ConnectButton otherUserId={profile.id} />
            {/* A private member is unreachable until they accept. Showing the
                button anyway would only produce a permission error from RLS. */}
            {/* And a 1:1 DM across the adult/minor line is refused by the
                server (091), so the same reasoning applies. */}
            {canView && canDmAcrossAges(auth.profile, profile) && (
              <Button
                variant="outline"
                size="sm"
                icon={<MessageSquare size={16} />}
                onClick={() => openPanel({ userId: profile.id })}
              >
                <Trans>Message</Trans>
              </Button>
            )}
            <Link to={`/grievances/report/${profile.id}`}>
              <Button
                variant="ghost"
                size="sm"
                icon={<Flag size={16} />}
                className="text-ktip-sand-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trans>Report</Trans>
              </Button>
            </Link>
          </div>
        )}
      </header>

      {/* ---------- Private ----------
          Everything below this point is driven by queries that were never
          issued when can_view is false, so they collapse on their own. This
          panel exists so the page says why rather than looking broken. */}
      {canView === false && (
        <section className="rounded-3xl border border-ktip-sand-200 bg-ktip-cream p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ktip-sand-100">
            <Lock size={22} className="text-ktip-sand-500" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold text-ktip-sand-900">
            <Trans>This profile is private</Trans>
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ktip-sand-600">
            {privateProfileMessage}
          </p>
          {!isSelf && auth.user && (
            <div className="mt-5 flex justify-center">
              <ConnectButton otherUserId={profile.id} />
            </div>
          )}
        </section>
      )}

      {/* ---------- Organisation ----------
          profiles.organization has always been free text that links nowhere.
          This is the registered entity behind it, with the work it publishes —
          the business equivalent of the CV an individual member gets. */}
      {employer && (
        <section
          id="organisation"
          data-spy="Organisation"
          className="scroll-mt-24 rounded-3xl border border-ktip-sand-200 bg-ktip-cream p-6"
        >
          <div className="flex flex-wrap items-start gap-4">
            {employer.logo_url ? (
              <img
                src={employer.logo_url}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ktip-ocean-100">
                <Building2 size={24} className="text-ktip-ocean-600" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Link
                to={`/org/${employer.slug}`}
                className="flex items-center gap-1.5 font-display text-lg font-bold text-ktip-sand-900 hover:text-ktip-ocean-600"
              >
                {employer.trading_name || employer.legal_name}
                <ExternalLink size={14} aria-hidden="true" />
              </Link>
              {employer.industry && (
                <p className="text-sm text-ktip-sand-500">{employer.industry}</p>
              )}
              {employer.description && (
                <p className="mt-2 line-clamp-3 text-sm text-ktip-sand-700">
                  {employer.description}
                </p>
              )}
            </div>
          </div>

          {portfolio && portfolio.length > 0 && (
            <div className="mt-5 border-t border-ktip-sand-100 pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ktip-sand-500">
                <Trans>Portfolio</Trans>
              </p>
              <ul className="space-y-1.5">
                {portfolio.slice(0, 4).map((item) => (
                  <li key={item.id} className="text-sm text-ktip-sand-800">
                    <span className="font-medium">{item.title}</span>
                    {item.summary && (
                      <span className="text-ktip-sand-600"> — {item.summary}</span>
                    )}
                  </li>
                ))}
              </ul>
              {portfolio.length > 4 && (
                <Link
                  to={`/org/${employer.slug}`}
                  className="mt-2 inline-block text-sm font-medium text-ktip-ocean-600 hover:underline"
                >
                  <Trans>All {portfolio.length} pieces of work</Trans>
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {/* ---------- Standing ----------
          Rendered only when there is something to show: a zeroed-out card on a
          brand-new member reads as a scoreboard of failure. */}
      {stats && stats.badge_count > 0 && (
        <section
          id="standing"
          data-spy="Standing"
          className="scroll-mt-24 rounded-3xl border border-ktip-sand-200 bg-ktip-cream p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
                <Trans>Level {stats.rank.level}</Trans>
              </p>
              <h2 className="font-display text-2xl font-bold text-ktip-sand-900">
                {stats.rank.name}
              </h2>
            </div>

            <dl className="flex gap-6">
              <div className="text-center">
                <dt className="text-xs uppercase tracking-wider text-ktip-sand-500"><Trans>Points</Trans></dt>
                <dd className="font-display text-2xl font-bold tabular-nums text-ktip-ocean-700">
                  {stats.points}
                </dd>
              </div>
              <div className="text-center">
                <dt className="text-xs uppercase tracking-wider text-ktip-sand-500"><Trans>Achievements</Trans></dt>
                <dd className="font-display text-2xl font-bold tabular-nums text-ktip-ocean-700">
                  {stats.badge_count}
                </dd>
              </div>
              {/* Null unless you are looking at your own profile — a streak on
                  someone else's page reads as surveillance, not achievement. */}
              {stats.streak_days !== null && (
                <div className="text-center">
                  <dt className="flex items-center gap-1 text-xs uppercase tracking-wider text-ktip-sand-500">
                    <Flame size={12} aria-hidden="true" />
                    <Trans>Streak</Trans>
                  </dt>
                  <dd className="font-display text-2xl font-bold tabular-nums text-ktip-ocean-700">
                    {stats.streak_days}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {showcase.length > 0 && (
            <div className="mt-5 border-t border-ktip-sand-100 pt-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ktip-sand-500">
                <Trans>Showcase</Trans>
              </p>
              <ul className="flex flex-wrap gap-4">
                {showcase.map((pin) => (
                  <li key={pin.position} className="flex w-20 flex-col items-center gap-1.5 text-center">
                    <MiniTrophy badge={pin.badge} assetMap={assetMap} size={56} />
                    <span className="text-[11px] leading-tight text-ktip-sand-600">
                      {pin.badge.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isSelf && (
            <Link to="/dashboard/achievements" className="mt-4 inline-block">
              <Button variant="ghost" size="sm" icon={<Trophy size={14} />}>
                <Trans>Manage your achievements</Trans>
              </Button>
            </Link>
          )}
        </section>
      )}

      {/* ---------- About ---------- */}
      {(profile.bio || profile.skills?.length || profile.interests?.length || profile.open_to?.length) && (
        <section
          id="about"
          data-spy="About"
          className="scroll-mt-24 space-y-4 rounded-3xl border border-ktip-sand-200 bg-ktip-cream p-6"
        >
          {profile.bio && (
            <p className="whitespace-pre-wrap text-ktip-sand-700">{profile.bio}</p>
          )}

          {profile.skills?.length ? (
            <TagRow label={t`Skills`} values={profile.skills} tone="ocean" />
          ) : null}
          {profile.interests?.length ? (
            <TagRow label={t`Interests`} values={profile.interests} tone="tropical" />
          ) : null}

          {profile.open_to?.length ? (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ktip-sand-500">
                <Trans>Open to</Trans>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.open_to.map((value) => (
                  <span
                    key={value}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      value === COLLAB_EXCLUSIVE_VALUE
                        ? 'border-ktip-sand-200 bg-ktip-sand-50 text-ktip-sand-500'
                        : 'border-ktip-ocean-200 bg-ktip-ocean-50 text-ktip-ocean-700'
                    }`}
                  >
                    <Handshake size={12} aria-hidden="true" />
                    {COLLABORATION_LABELS[value] || value}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* ---------- Every badge ---------- */}
      {badges?.length ? (
        <section
          id="achievements"
          data-spy="Achievements"
          className="scroll-mt-24 rounded-3xl border border-ktip-sand-200 bg-ktip-cream p-6"
        >
          <h2 className="mb-3 font-display text-lg font-bold text-ktip-sand-900"><Trans>Achievements</Trans></h2>
          <div className="flex flex-wrap gap-2">
            {badges.map((userBadge) => (
              <AchievementBadge key={userBadge.id} userBadge={userBadge} size="md" byRarity />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- Work ---------- */}
      {projects?.length ? (
        <LinkSection
          id="projects"
          spy="Projects"
          title={t`Projects`}
          icon={<FolderKanban size={14} aria-hidden="true" />}
          items={projects.map((p) => ({ id: p.id, label: p.title, to: entityPath('project', p) }))}
        />
      ) : null}

      {events?.length ? (
        <LinkSection
          id="events"
          spy="Events"
          title={t`Events`}
          icon={<Calendar size={14} aria-hidden="true" />}
          items={events.map((e) => ({ id: e.id, label: e.title, to: entityPath('event', e) }))}
        />
      ) : null}
    </div>
  )
}

function TagRow({
  label,
  values,
  tone,
}: {
  label: string
  values: string[]
  tone: 'ocean' | 'tropical'
}) {
  const toneClass =
    tone === 'ocean'
      ? 'border-ktip-ocean-200 bg-ktip-ocean-50 text-ktip-ocean-700'
      : 'border-ktip-tropical-200 bg-ktip-tropical-50 text-ktip-tropical-700'

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ktip-sand-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  )
}

function LinkSection({
  id,
  spy,
  title,
  icon,
  items,
}: {
  /** URL fragment. Stable and English — a translated #anchor breaks every
      shared link the moment the reader's language differs from the sharer's. */
  id: string
  /** Scroll-spy marker. Also English, and for a harder reason: the tutorials in
      src/data/tutorials target these by literal string
      (`[data-spy="Members"]`), so translating one silently breaks a page tour
      with no error anywhere. DENY_ATTRS keeps the codemod off it; this keeps a
      person off it too. */
  spy: string
  title: string
  icon: React.ReactNode
  items: { id: string; label: string; to: string }[]
}) {
  return (
    <section
      id={id}
      data-spy={spy}
      className="scroll-mt-24 rounded-3xl border border-ktip-sand-200 bg-ktip-cream p-6"
    >
      <h2 className="mb-3 flex items-center gap-1.5 font-display text-lg font-bold text-ktip-sand-900">
        {icon}
        {title}
      </h2>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={item.to}
              className="block truncate rounded-lg px-3 py-2 text-sm text-ktip-sand-700 transition-colors hover:bg-ktip-sand-50 hover:text-ktip-ocean-700"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
