import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { PageHero } from '../../components/layout/PageHero'
import { useAdminStats } from '../../hooks/useAdminDashboard'
import { useAdminAnalytics } from '../../hooks/useAdminAnalytics'
import { BarChart } from '../../components/admin/analytics/BarChart'
import { GrowthChart } from '../../components/admin/analytics/GrowthChart'
import { ExportButton } from '../../components/admin/analytics/ExportButton'
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
} from 'lucide-react'
import {
  ROLE_LABELS,
  PHASE_LABELS,
  EVENT_TYPE_LABELS,
  GRANT_APPLICATION_STATUS_LABELS,
} from '../../lib/constants'

export default function AdminDashboardPage() {
  const { stats, loading: statsLoading } = useAdminStats()
  const { analytics, loading: analyticsLoading } = useAdminAnalytics()

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Admin Dashboard"
        title="Platform Overview"
        subtitle="Overview of your platform activity"
        imageSeed="admin"
        actions={analytics ? <ExportButton analytics={analytics} /> : undefined}
      />

      {/* Stats Grid */}
      {statsLoading || !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div className="border border-gray-200 rounded-lg p-4 animate-pulse" key={i}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100" />
                <div className="space-y-2">
                  <div className="h-6 w-12 bg-gray-100 rounded" />
                  <div className="h-3 w-16 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
                <Users size={20} className="text-ktip-ocean-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.userCount}</p>
                <p className="text-xs text-gray-500">Total Users</p>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ktip-tropical-100 flex items-center justify-center">
                <Calendar size={20} className="text-ktip-tropical-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.eventCount}</p>
                <p className="text-xs text-gray-500">Total Events</p>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
                <DollarSign size={20} className="text-ktip-ocean-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.grantCount}</p>
                <p className="text-xs text-gray-500">Active Grants</p>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ktip-sun-100 flex items-center justify-center">
                <MessageSquare size={20} className="text-ktip-sun-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.postCount}</p>
                <p className="text-xs text-gray-500">Forum Posts</p>
              </div>
            </div>
          </div>

          {analytics && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-ktip-sun-100 flex items-center justify-center">
                  <BookOpen size={20} className="text-ktip-sun-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{analytics.resourceCount}</p>
                  <p className="text-xs text-gray-500">Resources</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Climate Action Stats */}
      {stats && (
        <div className="border border-gray-200 rounded-lg p-5 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Leaf size={18} className="text-ktip-tropical-700" />
            <h2 className="text-sm font-semibold text-ktip-tropical-900">Climate Action</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-ktip-tropical-800">{stats.climateProjectCount}</p>
              <p className="text-xs text-ktip-tropical-700">Projects</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ktip-tropical-800">{stats.climateEventCount}</p>
              <p className="text-xs text-ktip-tropical-700">Events</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ktip-tropical-800">{stats.climateGrantCount}</p>
              <p className="text-xs text-ktip-tropical-700">Grants</p>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Charts */}
      {analyticsLoading || !analytics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div className="border border-gray-200 rounded-lg p-6 animate-pulse" key={i}>
              <div className="h-5 w-32 bg-gray-100 rounded mb-4" />
              <div className="space-y-3">
                <div className="h-3 w-full bg-gray-100 rounded" />
                <div className="h-3 w-3/4 bg-gray-100 rounded" />
                <div className="h-3 w-1/2 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* User Growth Chart */}
          {analytics.userGrowth.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-ktip-ocean-600" />
                <h2 className="text-lg font-semibold text-gray-900">User Growth</h2>
              </div>
              <GrowthChart data={analytics.userGrowth} />
            </div>
          )}

          {/* Distribution Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Users by Role */}
            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-ktip-ocean-600" />
                <h2 className="text-sm font-semibold text-gray-900">Users by Role</h2>
              </div>
              <BarChart data={analytics.usersByRole} colorClass="bg-ktip-ocean-500" labelMap={ROLE_LABELS} />
            </div>

            {/* Users by Country */}
            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Globe size={18} className="text-ktip-tropical-600" />
                <h2 className="text-sm font-semibold text-gray-900">Users by Country</h2>
              </div>
              <BarChart data={analytics.usersByCountry} colorClass="bg-ktip-tropical-500" />
            </div>

            {/* Projects by Category */}
            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <FolderKanban size={18} className="text-ktip-ocean-600" />
                <h2 className="text-sm font-semibold text-gray-900">Projects by Category</h2>
              </div>
              <BarChart data={analytics.projectsByCategory} colorClass="bg-ktip-ocean-500" />
            </div>

            {/* Projects by Phase */}
            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={18} className="text-ktip-ocean-600" />
                <h2 className="text-sm font-semibold text-gray-900">Projects by Phase</h2>
              </div>
              <BarChart data={analytics.projectsByPhase} colorClass="bg-ktip-ocean-500" labelMap={PHASE_LABELS} />
            </div>

            {/* Events by Type */}
            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar size={18} className="text-ktip-tropical-600" />
                <h2 className="text-sm font-semibold text-gray-900">Events by Type</h2>
              </div>
              <BarChart data={analytics.eventsByType} colorClass="bg-ktip-tropical-500" labelMap={EVENT_TYPE_LABELS} />
            </div>

            {/* Grant Application Pipeline */}
            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={18} className="text-ktip-ocean-600" />
                <h2 className="text-sm font-semibold text-gray-900">Grant Application Pipeline</h2>
              </div>
              <BarChart data={analytics.grantPipeline} colorClass="bg-ktip-ocean-500" labelMap={GRANT_APPLICATION_STATUS_LABELS} />
            </div>
          </div>
        </>
      )}

      {/* Quick Actions */}
      <div className="border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/events/new">
            <Button size="sm" icon={<Plus size={14} />}>
              Create Event
            </Button>
          </Link>
          <Link to="/admin/grants">
            <Button size="sm" variant="secondary" icon={<DollarSign size={14} />}>
              Manage Grants
            </Button>
          </Link>
          <Link to="/admin/resources">
            <Button size="sm" variant="secondary" icon={<BookOpen size={14} />}>
              Manage Resources
            </Button>
          </Link>
          <Link to="/admin/users">
            <Button size="sm" variant="outline" icon={<Users size={14} />}>
              Manage Users
            </Button>
          </Link>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <Link
          to="/admin/events"
          className="group border border-gray-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
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

        <Link
          to="/admin/users"
          className="group border border-gray-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
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

        <Link
          to="/admin/grants"
          className="group border border-gray-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
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

        <Link
          to="/admin/forums"
          className="group border border-gray-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
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

        <Link
          to="/admin/resources"
          className="group border border-gray-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
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
      </div>
    </>
  )
}
