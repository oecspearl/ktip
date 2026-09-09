import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { PageHero } from '../../components/layout/PageHero'
import { useAuth } from '../../contexts/AuthContext'
import {
  useAdminStats,
  useAdminAttention,
  TREND_WINDOW_DAYS,
  type AttentionKey,
} from '../../hooks/useAdminDashboard'
import { useAdminAnalytics } from '../../hooks/useAdminAnalytics'
import { useTutorialAutoStart } from '../../hooks/useTutorialAutoStart'
import { TUTORIAL_IDS } from '../../data/tutorials'
import { ExportButton } from '../../components/admin/analytics/ExportButton'
import { DashboardCalendar } from '../../components/calendar/DashboardCalendar'
import {
  Users,
  Calendar,
  DollarSign,
  MessageSquare,
  BookOpen,
  Plus,
  ArrowRight,
  Leaf,
  BarChart3,
  FileText,
  Target,
  Inbox,
  BadgeCheck,
  ShieldAlert,
  Flag,
  GraduationCap,
  Landmark,
  MessageCircle,
} from 'lucide-react'
import { AdminStatTile } from '../../components/admin/AdminStatTile'
import { AdminQueueTile } from '../../components/admin/AdminQueueTile'
import { KpiTargetTile } from '../../components/admin/kpi/KpiTargetTile'
import { usePlatformPulse, useKpiTargets } from '../../hooks/usePlatformPulse'
import { PLATFORM_KPIS } from '../../lib/kpi-catalog'
import type { Measured } from '../../lib/measured'

/**
 * The four the programme lead is asked about most: are people joining, are they
 * coming back, is there work on the platform, and is money moving. The other
 * thirty are one click away.
 */
const HEADLINE_KPI_KEYS = [
  't33.new_registrations_total',
  't34.mau_pct',
  't35.active_projects',
  't37.users_connected_to_funding',
]

/** "+6 in 30d", or nothing at all when that particular count was refused. */
function since(measured: Measured): string | null {
  if (measured.state !== 'ok') return null
  return `+${measured.value.toLocaleString()} in ${TREND_WINDOW_DAYS}d`
}

/** Sort weight: work first (deepest queue leftmost), then unreadable, then clear. */
function rankOf(measured: Measured | undefined): number {
  if (!measured || measured.state !== 'ok') return 0
  return measured.value > 0 ? -measured.value : 1
}

/** The parts of a hint that could actually be read, joined; undefined if none. */
function hintOf(...parts: (string | null)[]): string | undefined {
  const real = parts.filter((part): part is string => !!part)
  return real.length ? real.join(' · ') : undefined
}

function ClimateFigure({ label, measured }: { label: string; measured: Measured }) {
  return (
    <div title={measured.state === 'unavailable' ? measured.reason : undefined}>
      <p
        className={`text-2xl font-bold ${
          measured.state === 'ok' ? 'text-ktip-tropical-800' : 'text-ktip-sand-400'
        }`}
      >
        {measured.state === 'ok' ? measured.value.toLocaleString() : '—'}
      </p>
      <p className="text-xs text-ktip-tropical-700">{label}</p>
      {measured.state === 'unavailable' && (
        <p className="text-xs text-ktip-sun-700">Couldn't load</p>
      )}
    </div>
  )
}

export default function AdminDashboardPage() {
  const auth = useAuth()
  const { stats, loading: statsLoading } = useAdminStats()
  // Still fetched for the CSV export in the hero; the charts it fed moved to
  // the analytics hub.
  const { analytics, loading: analyticsLoading } = useAdminAnalytics()
  const { pulse } = usePlatformPulse()
  const { targets } = useKpiTargets()

  useTutorialAutoStart(TUTORIAL_IDS.ADMIN, !statsLoading && !analyticsLoading)

  // This is the one admin page with no permission gate — everyone AdminRoute
  // admits has to land somewhere — so it filters itself instead, the same way
  // AdminLayout filters its sidebar.
  //
  // Without this a supervisor sees "0 Total Events" rather than nothing at all,
  // because RLS answers a count they cannot read with zero rather than with an
  // error. A tile reading 0 is a claim about the platform; hiding the tile is
  // the truth, which is that this is not their surface.
  const canSeeUsers = auth.can('members:view')
  const canSeeEvents = auth.can('event:manage')
  const canSeeGrants = auth.can('grant:manage')
  const canSeeForums = auth.can('forum:manage')
  const canSeeResources = auth.can('resource:manage')
  const canSeeProjects = auth.can('project:manage_all')
  const canSeeClimate = canSeeProjects || canSeeEvents || canSeeGrants
  // The analytics block reads across every table at once, so it belongs to the
  // one key that still means "the whole platform".
  const canSeeAnalytics = auth.can('org:manage')
  const canSeeVerification = auth.can('verification:review')
  const canSeeModeration = auth.can('moderation:view')
  const canSeeInstitutions = auth.can('institution:verify')
  const canSeeChamber = auth.can('sme:verify')

  // Each queue is fetched only for the seat that can work it — the same rule as
  // the tiles above, and here it also decides what gets queried at all.
  const { attention } = useAdminAttention({
    verification: canSeeVerification,
    moderation: canSeeModeration,
    grants: canSeeGrants,
    institutions: canSeeInstitutions,
    chamber: canSeeChamber,
    resources: canSeeResources,
    feedback: canSeeAnalytics,
  })

  const allQueues: { key: AttentionKey; label: string; noun: string; to: string; icon: ReactNode }[] = [
    {
      key: 'verification',
      label: 'Verification',
      noun: 'documents waiting',
      to: '/admin/verification',
      icon: <BadgeCheck size={20} className="text-ktip-sun-700" />,
    },
    {
      key: 'reports',
      label: 'Reported content',
      noun: 'reports open',
      to: '/admin/moderation',
      icon: <ShieldAlert size={20} className="text-ktip-sun-700" />,
    },
    {
      key: 'grievances',
      label: 'Grievances',
      noun: 'cases open',
      to: '/admin/grievances',
      icon: <Flag size={20} className="text-ktip-sun-700" />,
    },
    {
      key: 'applications',
      label: 'Grant applications',
      noun: 'awaiting review',
      to: '/admin/grants?tab=applications',
      icon: <FileText size={20} className="text-ktip-sun-700" />,
    },
    {
      key: 'institutions',
      label: 'Institutions',
      noun: 'awaiting verification',
      to: '/admin/institutions',
      icon: <GraduationCap size={20} className="text-ktip-sun-700" />,
    },
    {
      key: 'employers',
      label: 'Chamber review',
      noun: 'businesses waiting',
      to: '/admin/chamber',
      icon: <Landmark size={20} className="text-ktip-sun-700" />,
    },
    {
      key: 'submissions',
      label: 'Resource submissions',
      noun: 'awaiting approval',
      to: '/admin/resources?tab=review',
      icon: <BookOpen size={20} className="text-ktip-sun-700" />,
    },
    {
      key: 'feedback',
      label: 'Feedback',
      noun: 'reports open',
      to: '/admin/feedback',
      icon: <MessageCircle size={20} className="text-ktip-sun-700" />,
    },
  ]

  // Only the queues this seat was allowed to read came back at all.
  const queues = allQueues
    .filter((queue) => !!attention?.[queue.key])
    // Busiest first, then anything that could not be read, then the clear ones.
    // Whoever opens this page at nine in the morning should not have to scan
    // eight tiles to find the one with work in it.
    .sort((a, b) => rankOf(attention?.[a.key]) - rankOf(attention?.[b.key]))

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Admin Dashboard"
        title="Platform Overview"
        subtitle="Overview of your platform activity"
        imageSeed="admin"
        actions={analytics && canSeeAnalytics ? <ExportButton analytics={analytics} /> : undefined}
      />

      {/* Needs attention.
          First, and above the totals, because it is the only band on the page
          that names something to do. The totals below say how big the platform
          is; this says who is waiting on you. Each tile is a link into the
          queue it counts, so the answer to "what should I open" is one click
          rather than a guess at which of twenty-two sections has entries. */}
      {queues.length > 0 && (
        <div data-tutorial="admin-attention" className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Inbox size={18} className="text-ktip-sun-700" />
            <h2 className="text-lg font-semibold text-gray-900">Needs attention</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
            {queues.map((queue) => (
              <AdminQueueTile
                key={queue.key}
                icon={queue.icon}
                label={queue.label}
                noun={queue.noun}
                to={queue.to}
                measured={attention![queue.key]!}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      {statsLoading || !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-children">
          {[1, 2, 3, 4].map((i) => (
            <div className="neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-4 animate-pulse" key={i}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-ktip-sand-100" />
                <div className="space-y-2">
                  <div className="h-6 w-12 bg-ktip-sand-100 rounded" />
                  <div className="h-3 w-16 bg-ktip-sand-100 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div data-tutorial="admin-stats" className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8 stagger-children">
          {canSeeUsers && (
            <AdminStatTile
              emphasis
              icon={<Users size={20} className="text-ktip-ocean-600" />}
              iconClass="bg-ktip-ocean-100"
              label="Total Users"
              measured={stats.userCount}
              hint={hintOf(
                since(stats.newUserCount),
                stats.verifiedUserCount.state === 'ok'
                  ? `${stats.verifiedUserCount.value.toLocaleString()} verified`
                  : null
              )}
            />
          )}

          {canSeeEvents && (
            <AdminStatTile
              emphasis
              icon={<Calendar size={20} className="text-ktip-tropical-600" />}
              iconClass="bg-ktip-tropical-100"
              label="Events Hosted"
              measured={stats.eventCount}
              hint={
                stats.upcomingEventCount.state === 'ok'
                  ? `${stats.upcomingEventCount.value.toLocaleString()} still to come`
                  : undefined
              }
            />
          )}

          {canSeeGrants && (
            <AdminStatTile
              emphasis
              icon={<DollarSign size={20} className="text-ktip-ocean-600" />}
              iconClass="bg-ktip-ocean-100"
              label="Active Grants"
              measured={stats.grantCount}
              hint={
                stats.closingGrantCount.state === 'ok'
                  ? `${stats.closingGrantCount.value.toLocaleString()} close in ${TREND_WINDOW_DAYS}d`
                  : undefined
              }
            />
          )}

          {/* Fetched on every load since the dashboard was written and never
              rendered. Roadmap §14 T37 counts exactly this ("users connected to
              funding"), so it earns the tile rather than being deleted. */}
          {canSeeGrants && (
            <AdminStatTile
              emphasis
              icon={<FileText size={20} className="text-ktip-ocean-600" />}
              iconClass="bg-ktip-ocean-100"
              label="Grant Applications"
              measured={stats.applicationCount}
              hint={hintOf(since(stats.newApplicationCount))}
            />
          )}

          {canSeeForums && (
            <AdminStatTile
              emphasis
              icon={<MessageSquare size={20} className="text-ktip-sun-600" />}
              iconClass="bg-ktip-sun-100"
              label="Discussions"
              measured={stats.postCount}
              hint={hintOf(since(stats.newPostCount))}
            />
          )}

          {analytics && canSeeResources && (
            <AdminStatTile
              emphasis
              icon={<BookOpen size={20} className="text-ktip-sun-700" />}
              iconClass="bg-ktip-sun-100"
              label="Resources"
              measured={analytics.resourceCount}
            />
          )}
        </div>
      )}

      {/* Climate Action Stats */}
      {stats && canSeeClimate && (
        <div data-tutorial="admin-climate" className="neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Leaf size={18} className="text-ktip-tropical-700" />
            <h2 className="text-sm font-semibold text-ktip-tropical-900">Climate Action</h2>
          </div>
          {/* These three used to hard-fall-back to 0 whenever the
              is_climate_action query failed, which is the failure mode this
              page's own comment above calls unacceptable. */}
          <div className="grid grid-cols-3 gap-4">
            <ClimateFigure label="Projects" measured={stats.climateProjectCount} />
            <ClimateFigure label="Events" measured={stats.climateEventCount} />
            <ClimateFigure label="Grants" measured={stats.climateGrantCount} />
          </div>
        </div>
      )}

      {/* Results framework summary.
          Four tiles, not thirty. The full §14 board lives at /admin/impact:
          this page is the console landing page that every seat AdminRoute
          admits has to pass through, and burying a thirty-KPI grid behind
          org:manage here would make most of it invisible to both supervisors. */}
      {canSeeAnalytics && (
        <div className="neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-5 mb-8">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-ktip-ocean-600" />
              <h2 className="text-lg font-semibold text-gray-900">Results Framework</h2>
            </div>
            <Link
              to="/admin/impact"
              className="inline-flex items-center gap-1 text-sm font-medium text-ktip-ocean-700 hover:underline"
            >
              All KPIs
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {HEADLINE_KPI_KEYS.map((key) => {
              const kpi = PLATFORM_KPIS.find((k) => k.key === key)
              if (!kpi) return null
              return (
                <KpiTargetTile
                  key={kpi.key}
                  kpi={kpi}
                  measured={kpi.read(pulse)}
                  target={targets?.[kpi.key]?.target_value ?? null}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Platform Calendar */}
      <div className="neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={18} className="text-ktip-ocean-600" />
          <h2 className="text-lg font-semibold text-gray-900">Platform Calendar</h2>
        </div>
        <DashboardCalendar scope="platform" />
      </div>

      {/* The distribution charts that used to sit here — users by role and
          country, projects by category and phase, events by type, the grant
          pipeline — live on the analytics hub now, as trends with a period and
          country filter, alongside the usage figures and the reporting pulse.
          The landing page keeps the numbers and the calendar; the charts are
          one click away with the filters they needed. */}
      {canSeeAnalytics && (
        <div data-tutorial="admin-charts" className="neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-5 mb-8">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-ktip-ocean-600" />
              <h2 className="text-lg font-semibold text-gray-900">Analytics &amp; Reports</h2>
            </div>
            <Link
              to="/admin/analytics"
              className="inline-flex items-center gap-1 text-sm font-medium text-ktip-ocean-700 hover:underline"
            >
              Open the hub
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
            {(
              [
                ['community', 'Community', 'members by role, state, partnerships'],
                ['activity', 'Activity', 'projects, events, funding pipeline'],
                ['engagement', 'Engagement', 'active members, usage, funnels'],
                ['health', 'Health & trust', 'uptime, errors, complaints'],
                ['results', 'Results framework', 'every roadmap KPI vs target'],
                ['reports', 'Reports', 'weekly pulse, monthly reports'],
              ] as const
            ).map(([tab, label, hint]) => (
              <Link
                key={tab}
                to={`/admin/analytics?tab=${tab}`}
                className="neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm px-3 py-2 transition-colors hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50"
              >
                <p className="font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{hint}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div data-tutorial="admin-quick-actions" className="neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {/* event:create, not event:manage — publishing an event under your own
              name is something every supervisor can do. */}
          {auth.can('event:create') && (
            <Link to="/events/new">
              <Button size="sm" icon={<Plus size={14} />}>
                Create Event
              </Button>
            </Link>
          )}
          {canSeeGrants && (
            <Link to="/admin/grants">
              <Button size="sm" variant="secondary" icon={<DollarSign size={14} />}>
                Manage Grants
              </Button>
            </Link>
          )}
          {canSeeResources && (
            <Link to="/admin/resources">
              <Button size="sm" variant="secondary" icon={<BookOpen size={14} />}>
                Manage Resources
              </Button>
            </Link>
          )}
          {canSeeUsers && (
            <Link to="/admin/users">
              <Button size="sm" variant="outline" icon={<Users size={14} />}>
                Manage Users
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        {canSeeEvents && (
        <Link
          to="/admin/events"
          className="group neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-5 hover:border-ktip-ocean-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
                <Calendar size={20} className="text-ktip-ocean-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Events</h3>
                <p className="text-xs text-gray-500">Manage events, registrations & content</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-gray-300 group-hover:text-ktip-ocean-500 transition-colors" />
          </div>
        </Link>
        )}

        {canSeeUsers && (
        <Link
          to="/admin/users"
          className="group neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-5 hover:border-ktip-ocean-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ktip-tropical-100 flex items-center justify-center">
                <Users size={20} className="text-ktip-tropical-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Users</h3>
                <p className="text-xs text-gray-500">Manage roles, verification & profiles</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-gray-300 group-hover:text-ktip-ocean-500 transition-colors" />
          </div>
        </Link>
        )}

        {canSeeGrants && (
        <Link
          to="/admin/grants"
          className="group neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-5 hover:border-ktip-ocean-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
                <DollarSign size={20} className="text-ktip-ocean-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Grants</h3>
                <p className="text-xs text-gray-500">Create grants & review applications</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-gray-300 group-hover:text-ktip-ocean-500 transition-colors" />
          </div>
        </Link>
        )}

        {canSeeForums && (
        <Link
          to="/admin/forums"
          className="group neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-5 hover:border-ktip-ocean-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ktip-sun-100 flex items-center justify-center">
                <MessageSquare size={20} className="text-ktip-sun-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Forums</h3>
                <p className="text-xs text-gray-500">Moderate posts, pin content & manage boards</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-gray-300 group-hover:text-ktip-ocean-500 transition-colors" />
          </div>
        </Link>
        )}

        {canSeeResources && (
        <Link
          to="/admin/resources"
          className="group neu-surface rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-neu-sm p-5 hover:border-ktip-ocean-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ktip-sun-100 flex items-center justify-center">
                <BookOpen size={20} className="text-ktip-sun-700" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Resources</h3>
                <p className="text-xs text-gray-500">Manage knowledge base articles & guides</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-gray-300 group-hover:text-ktip-ocean-500 transition-colors" />
          </div>
        </Link>
        )}
      </div>
    </>
  )
}
