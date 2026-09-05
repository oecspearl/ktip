import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { PageHero } from '../../components/layout/PageHero'
import { useAuth } from '../../contexts/AuthContext'
import { useAdminStats } from '../../hooks/useAdminDashboard'
import { useAdminAnalytics } from '../../hooks/useAdminAnalytics'
import { useTutorialAutoStart } from '../../hooks/useTutorialAutoStart'
import { TUTORIAL_IDS } from '../../data/tutorials'
import { BarChart } from '../../components/admin/analytics/BarChart'
import { GrowthChart } from '../../components/admin/analytics/GrowthChart'
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
  TrendingUp,
  Globe,
  FolderKanban,
  FileText,
  Target,
} from 'lucide-react'
import { AdminStatTile } from '../../components/admin/AdminStatTile'
import { KpiTargetTile } from '../../components/admin/kpi/KpiTargetTile'
import { usePlatformPulse, useKpiTargets } from '../../hooks/usePlatformPulse'
import { PLATFORM_KPIS } from '../../lib/kpi-catalog'
import { itemsOf, type Measured } from '../../lib/measured'

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
import {
  ROLE_LABELS,
  PHASE_LABELS,
  EVENT_TYPE_LABELS,
  GRANT_APPLICATION_STATUS_LABELS,
} from '../../lib/constants'
import { useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

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
    const { i18n } = useLingui()
  const auth = useAuth()
  const { stats, loading: statsLoading } = useAdminStats()
  const { analytics, loading: analyticsLoading, refetch: refetchAnalytics } = useAdminAnalytics()
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

      {/* Stats Grid */}
      {statsLoading || !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-children">
          {[1, 2, 3, 4].map((i) => (
            <div className="border border-ktip-sand-200 rounded-lg p-4 animate-pulse" key={i}>
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
            />
          )}

          {canSeeEvents && (
            <AdminStatTile
              emphasis
              icon={<Calendar size={20} className="text-ktip-tropical-600" />}
              iconClass="bg-ktip-tropical-100"
              label="Events Hosted"
              measured={stats.eventCount}
            />
          )}

          {canSeeGrants && (
            <AdminStatTile
              emphasis
              icon={<DollarSign size={20} className="text-ktip-ocean-600" />}
              iconClass="bg-ktip-ocean-100"
              label="Active Grants"
              measured={stats.grantCount}
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
            />
          )}

          {canSeeForums && (
            <AdminStatTile
              emphasis
              icon={<MessageSquare size={20} className="text-ktip-sun-600" />}
              iconClass="bg-ktip-sun-100"
              label="Discussions"
              measured={stats.postCount}
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
        <div data-tutorial="admin-climate" className="border border-ktip-sand-200 rounded-lg p-5 mb-8">
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
        <div className="border border-ktip-sand-200 rounded-lg p-5 mb-8">
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
      <div className="border border-ktip-sand-200 rounded-lg p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={18} className="text-ktip-ocean-600" />
          <h2 className="text-lg font-semibold text-gray-900">Platform Calendar</h2>
        </div>
        <DashboardCalendar scope="platform" />
      </div>

      {/* Analytics Charts */}
      {!canSeeAnalytics ? null : analyticsLoading || !analytics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div className="border border-ktip-sand-200 rounded-lg p-6 animate-pulse" key={i}>
              <div className="h-5 w-32 bg-ktip-sand-100 rounded mb-4" />
              <div className="space-y-3">
                <div className="h-3 w-full bg-ktip-sand-100 rounded" />
                <div className="h-3 w-3/4 bg-ktip-sand-100 rounded" />
                <div className="h-3 w-1/2 bg-ktip-sand-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* User Growth Chart. Rendered unconditionally now — hiding it on an
              empty series also hid it when get_user_growth was refused, and the
              chart itself is what distinguishes the two. */}
          <div className="border border-ktip-sand-200 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-ktip-ocean-600" />
              <h2 className="text-lg font-semibold text-gray-900">User Growth</h2>
            </div>
            <GrowthChart
              data={itemsOf(analytics.userGrowth)}
              unavailable={
                analytics.userGrowth.state === 'unavailable' ? analytics.userGrowth.reason : undefined
              }
              onRetry={refetchAnalytics}
            />
          </div>

          {/* Distribution Charts Grid */}
          <div data-tutorial="admin-charts" className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Users by Role */}
            <div className="border border-ktip-sand-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-ktip-ocean-600" />
                <h2 className="text-sm font-semibold text-gray-900">Users by Role</h2>
              </div>
              {/* BarChart wants plain strings, so the descriptors are resolved
                  here rather than inside the chart. */}
              <BarChart
                data={itemsOf(analytics.usersByRole)}
                unavailable={analytics.usersByRole.state === 'unavailable' ? analytics.usersByRole.reason : undefined}
                onRetry={refetchAnalytics}
                colorClass="bg-ktip-ocean-500"
                labelMap={Object.fromEntries(
                  Object.entries(ROLE_LABELS).map(([slug, label]) => [slug, resolveCopy(i18n, label)])
                )}
              />
            </div>

            {/* Users by Country */}
            <div className="border border-ktip-sand-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Globe size={18} className="text-ktip-tropical-600" />
                <h2 className="text-sm font-semibold text-gray-900">Users by Country</h2>
              </div>
              <BarChart data={itemsOf(analytics.usersByCountry)}
                unavailable={analytics.usersByCountry.state === 'unavailable' ? analytics.usersByCountry.reason : undefined}
                onRetry={refetchAnalytics} colorClass="bg-ktip-tropical-500" />
            </div>

            {/* Projects by Category */}
            <div className="border border-ktip-sand-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <FolderKanban size={18} className="text-ktip-ocean-600" />
                <h2 className="text-sm font-semibold text-gray-900">Projects by Category</h2>
              </div>
              <BarChart data={itemsOf(analytics.projectsByCategory)}
                unavailable={analytics.projectsByCategory.state === 'unavailable' ? analytics.projectsByCategory.reason : undefined}
                onRetry={refetchAnalytics} colorClass="bg-ktip-ocean-500" />
            </div>

            {/* Projects by Phase */}
            <div className="border border-ktip-sand-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={18} className="text-ktip-ocean-600" />
                <h2 className="text-sm font-semibold text-gray-900">Projects by Phase</h2>
              </div>
              <BarChart data={itemsOf(analytics.projectsByPhase)}
                unavailable={analytics.projectsByPhase.state === 'unavailable' ? analytics.projectsByPhase.reason : undefined}
                onRetry={refetchAnalytics} colorClass="bg-ktip-ocean-500" labelMap={PHASE_LABELS} />
            </div>

            {/* Events by Type */}
            <div className="border border-ktip-sand-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar size={18} className="text-ktip-tropical-600" />
                <h2 className="text-sm font-semibold text-gray-900">Events by Type</h2>
              </div>
              <BarChart data={itemsOf(analytics.eventsByType)}
                unavailable={analytics.eventsByType.state === 'unavailable' ? analytics.eventsByType.reason : undefined}
                onRetry={refetchAnalytics} colorClass="bg-ktip-tropical-500" labelMap={EVENT_TYPE_LABELS} />
            </div>

            {/* Grant Application Pipeline */}
            <div className="border border-ktip-sand-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={18} className="text-ktip-ocean-600" />
                <h2 className="text-sm font-semibold text-gray-900">Grant Application Pipeline</h2>
              </div>
              <BarChart data={itemsOf(analytics.grantPipeline)}
                unavailable={analytics.grantPipeline.state === 'unavailable' ? analytics.grantPipeline.reason : undefined}
                onRetry={refetchAnalytics} colorClass="bg-ktip-ocean-500" labelMap={GRANT_APPLICATION_STATUS_LABELS} />
            </div>
          </div>
        </>
      )}

      {/* Quick Actions */}
      <div data-tutorial="admin-quick-actions" className="border border-ktip-sand-200 rounded-lg p-6">
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
          className="group border border-ktip-sand-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
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
          className="group border border-ktip-sand-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
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
          className="group border border-ktip-sand-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
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
          className="group border border-ktip-sand-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
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
          className="group border border-ktip-sand-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
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
