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
import { useProfile, useUserProjects, useUserEvents } from '../../hooks/useProfile'
import { useUserBadges } from '../../hooks/useBadges'
import { useConnectionCount } from '../../hooks/useConnections'
import { usePublicResume } from '../../hooks/useResume'
import { useProfileStats } from '../../hooks/useProfileStats'
import { useTrophyAssets, useTrackFlag } from '../../hooks/useAchievements'
import { useAuth } from '../../contexts/AuthContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import {
  ROLE_LABELS,
  ROLE_COLORS,
  COLLABORATION_LABELS,
  COLLAB_EXCLUSIVE_VALUE,
} from '../../lib/constants'
import { isOrganizationAccount } from '../../lib/permissions'
import { useEmployerForUser, useEmployerPortfolio } from '../../hooks/useEmployerProfile'
import { formatDate, getInitials, generateAvatarColor } from '../../lib/utils'

/**
 * The shareable member page, back after being folded into a drawer.
 *
 * The drawer over /directory is still the in-app default — it is faster and
 * keeps you in context. This page exists for the case the drawer cannot serve:
 * a URL someone can send to a funder, post in a chat, or screenshot. A rank
 * nobody outside the app can see is not worth chasing.
 *
 * Public by design, so it renders for a signed-out visitor following that link.
 * Points and rank come from get_profile_stats(), which returns nothing for a
 * suspended account and hides the streak from everyone but its owner.
 */
export default function PublicProfilePage() {
  const { id } = useParams()
  const auth = useAuth()
  const { openPanel } = useMessagingPanel()
  const trackFlag = useTrackFlag()

  const { profile, loading } = useProfile(id)
  const { projects } = useUserProjects(id)
  const { events } = useUserEvents(id)
  const { badges } = useUserBadges(id)
  const { count: connectionCount } = useConnectionCount(id)
  const { stats } = useProfileStats(id)
  const { assetMap } = useTrophyAssets()
  // The business this member belongs to, if it has been Chamber-verified.
  // profiles.organization is free text and links nowhere; this is the entity.
  const { employer } = useEmployerForUser(id)
  const { items: portfolio } = useEmployerPortfolio(employer?.id)
  // The published CV was orphaned: /u/:id/cv existed and nothing linked to it.
  // public_resume() returns nothing unless it is published, so this both
  // decides whether to show the link and guarantees it goes somewhere.
  const { data: publicResume } = usePublicResume(id)

  const displayName = profile?.display_name || 'Member'
  usePageTitle(profile ? displayName : 'Member')

  // Powers the 'explorer' hidden achievement. Viewing your own page does not
  // count — that would be a free badge for reloading.
  useEffect(() => {
    if (id && auth.user?.id && id !== auth.user.id) trackFlag('directory_views')
  }, [id, auth.user?.id, trackFlag])

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
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">Member not found</h1>
        <p className="mt-2 text-sm text-ktip-sand-600">
          This profile does not exist, or is no longer available.
        </p>
        <Link to="/directory" className="mt-4 inline-block">
          <Button variant="outline" size="sm">Browse the directory</Button>
        </Link>
      </div>
    )
  }

  const isSelf = id === auth.user?.id
  const showcase = stats?.showcase || []
  // An organisation account's page leads with the business, not a CV it will
  // never have. Individual accounts are untouched.
  const isOrgAccount = isOrganizationAccount(profile.roles)

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* ---------- Identity ---------- */}
      <header
        id="profile"
        data-spy="Profile"
        className="scroll-mt-24 rounded-3xl border border-ktip-sand-200 bg-ktip-cream p-6"
      >
        <div className="flex flex-wrap items-start gap-5">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              width={96}
              height={96}
              className="h-24 w-24 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full text-3xl font-bold text-white ${generateAvatarColor(displayName)}`}
            >
              {getInitials(displayName)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold text-ktip-sand-900">{displayName}</h1>
              {profile.is_verified && (
                <span className="text-ktip-ocean-500" title="Verified member">
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
                  {connectionCount === 1 ? 'connection' : 'connections'}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar size={14} aria-hidden="true" />
                Joined {formatDate(profile.created_at)}
              </span>
            </div>

            {profile.roles?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.roles.map((role) => (
                  <Badge key={role} className={ROLE_COLORS[role]}>
                    {ROLE_LABELS[role] || role}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Only rendered when the CV is actually published — see publicResume. */}
        {!isOrgAccount && publicResume && (
          <div className="mt-5">
            <Link to={`/u/${profile.id}/cv`}>
              <Button variant="outline" size="sm" icon={<FileText size={16} />}>
                View CV
              </Button>
            </Link>
          </div>
        )}

        {!isSelf && auth.user && (
          <div className="mt-5 flex flex-wrap gap-2">
            <ConnectButton otherUserId={profile.id} />
            <Button
              variant="outline"
              size="sm"
              icon={<MessageSquare size={16} />}
              onClick={() => openPanel({ userId: profile.id })}
            >
              Message
            </Button>
            <Link to={`/grievances/report/${profile.id}`}>
              <Button
                variant="ghost"
                size="sm"
                icon={<Flag size={16} />}
                className="text-ktip-sand-500 hover:bg-red-50 hover:text-red-600"
              >
                Report
              </Button>
            </Link>
          </div>
        )}
      </header>

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
                Portfolio
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
                  All {portfolio.length} pieces of work
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
                Level {stats.rank.level}
              </p>
              <h2 className="font-display text-2xl font-bold text-ktip-sand-900">
                {stats.rank.name}
              </h2>
            </div>

            <dl className="flex gap-6">
              <div className="text-center">
                <dt className="text-xs uppercase tracking-wider text-ktip-sand-500">Points</dt>
                <dd className="font-display text-2xl font-bold tabular-nums text-ktip-ocean-700">
                  {stats.points}
                </dd>
              </div>
              <div className="text-center">
                <dt className="text-xs uppercase tracking-wider text-ktip-sand-500">Achievements</dt>
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
                    Streak
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
                Showcase
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
            <Link to="/achievements" className="mt-4 inline-block">
              <Button variant="ghost" size="sm" icon={<Trophy size={14} />}>
                Manage your achievements
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
            <TagRow label="Skills" values={profile.skills} tone="ocean" />
          ) : null}
          {profile.interests?.length ? (
            <TagRow label="Interests" values={profile.interests} tone="tropical" />
          ) : null}

          {profile.open_to?.length ? (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ktip-sand-500">
                Open to
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
          <h2 className="mb-3 font-display text-lg font-bold text-ktip-sand-900">Achievements</h2>
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
          title="Projects"
          icon={<FolderKanban size={14} aria-hidden="true" />}
          items={projects.map((p) => ({ id: p.id, label: p.title, to: `/projects/${p.id}` }))}
        />
      ) : null}

      {events?.length ? (
        <LinkSection
          title="Events"
          icon={<Calendar size={14} aria-hidden="true" />}
          items={events.map((e) => ({ id: e.id, label: e.title, to: `/events/${e.id}` }))}
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
  title,
  icon,
  items,
}: {
  title: string
  icon: React.ReactNode
  items: { id: string; label: string; to: string }[]
}) {
  return (
    <section
      id={title.toLowerCase()}
      data-spy={title}
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
