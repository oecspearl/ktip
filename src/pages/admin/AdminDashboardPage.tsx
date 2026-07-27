import { Show, Suspense, For } from 'solid-js'
import { A } from '@solidjs/router'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { Button } from '../../components/ui/Button'
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
} from 'lucide-solid'
import {
  ROLE_LABELS,
  PHASE_LABELS,
  EVENT_TYPE_LABELS,
  GRANT_APPLICATION_STATUS_LABELS,
} from '../../lib/constants'

function AdminDashboardContent() {
  const { stats } = useAdminStats()
  const { analytics } = useAdminAnalytics()

  return (
    <>
      {/* Dark Header Band */}
      <div class="bg-gray-800 rounded-lg p-6 mb-8">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-400 uppercase tracking-wider">Admin Dashboard</p>
            <h1 class="text-2xl font-bold font-display text-white mt-1">
              Platform Overview
            </h1>
            <p class="mt-1 text-gray-400 text-sm">
              Overview of your platform activity
            </p>
          </div>
          <Show when={analytics()}>
            <ExportButton analytics={analytics()} />
          </Show>
        </div>
      </div>

      {/* Stats Grid */}
      <Suspense
        fallback={
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <For each={[1, 2, 3, 4]}>
              {() => (
                <div class="border border-gray-200 rounded-lg p-4 animate-pulse">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-gray-100" />
                    <div class="space-y-2">
                      <div class="h-6 w-12 bg-gray-100 rounded" />
                      <div class="h-3 w-16 bg-gray-100 rounded" />
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        }
      >
        <Show when={stats()}>
          {(s) => (
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
                    <Users size={20} class="text-ktip-ocean-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold text-gray-900">{s().userCount}</p>
                    <p class="text-xs text-gray-500">Total Users</p>
                  </div>
                </div>
              </div>

              <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-ktip-tropical-100 flex items-center justify-center">
                    <Calendar size={20} class="text-ktip-tropical-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold text-gray-900">{s().eventCount}</p>
                    <p class="text-xs text-gray-500">Total Events</p>
                  </div>
                </div>
              </div>

              <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <DollarSign size={20} class="text-purple-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold text-gray-900">{s().grantCount}</p>
                    <p class="text-xs text-gray-500">Active Grants</p>
                  </div>
                </div>
              </div>

              <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                    <MessageSquare size={20} class="text-yellow-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold text-gray-900">{s().postCount}</p>
                    <p class="text-xs text-gray-500">Forum Posts</p>
                  </div>
                </div>
              </div>

              <Show when={analytics()}>
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                      <BookOpen size={20} class="text-orange-600" />
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-gray-900">{analytics()!.resourceCount}</p>
                      <p class="text-xs text-gray-500">Resources</p>
                    </div>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </Suspense>

      {/* Climate Action Stats */}
      <Show when={stats()}>
        {(s) => (
          <div class="border border-gray-200 rounded-lg p-5 mb-8">
            <div class="flex items-center gap-2 mb-3">
              <Leaf size={18} class="text-emerald-600" />
              <h2 class="text-sm font-semibold text-emerald-800">Climate Action</h2>
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div>
                <p class="text-2xl font-bold text-emerald-700">{s().climateProjectCount}</p>
                <p class="text-xs text-emerald-600">Projects</p>
              </div>
              <div>
                <p class="text-2xl font-bold text-emerald-700">{s().climateEventCount}</p>
                <p class="text-xs text-emerald-600">Events</p>
              </div>
              <div>
                <p class="text-2xl font-bold text-emerald-700">{s().climateGrantCount}</p>
                <p class="text-xs text-emerald-600">Grants</p>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* Analytics Charts */}
      <Suspense
        fallback={
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <For each={[1, 2, 3, 4]}>
              {() => (
                <div class="border border-gray-200 rounded-lg p-6 animate-pulse">
                  <div class="h-5 w-32 bg-gray-100 rounded mb-4" />
                  <div class="space-y-3">
                    <div class="h-3 w-full bg-gray-100 rounded" />
                    <div class="h-3 w-3/4 bg-gray-100 rounded" />
                    <div class="h-3 w-1/2 bg-gray-100 rounded" />
                  </div>
                </div>
              )}
            </For>
          </div>
        }
      >
        <Show when={analytics()}>
          {(a) => (
            <>
              {/* User Growth Chart */}
              <Show when={a().userGrowth.length > 0}>
                <div class="border border-gray-200 rounded-lg p-6 mb-6">
                  <div class="flex items-center gap-2 mb-4">
                    <TrendingUp size={18} class="text-ktip-ocean-600" />
                    <h2 class="text-lg font-semibold text-gray-900">User Growth</h2>
                  </div>
                  <GrowthChart data={a().userGrowth} />
                </div>
              </Show>

              {/* Distribution Charts Grid */}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Users by Role */}
                <div class="border border-gray-200 rounded-lg p-6">
                  <div class="flex items-center gap-2 mb-4">
                    <Users size={18} class="text-ktip-ocean-600" />
                    <h2 class="text-sm font-semibold text-gray-900">Users by Role</h2>
                  </div>
                  <BarChart data={a().usersByRole} colorClass="bg-ktip-ocean-500" labelMap={ROLE_LABELS} />
                </div>

                {/* Users by Country */}
                <div class="border border-gray-200 rounded-lg p-6">
                  <div class="flex items-center gap-2 mb-4">
                    <Globe size={18} class="text-ktip-tropical-600" />
                    <h2 class="text-sm font-semibold text-gray-900">Users by Country</h2>
                  </div>
                  <BarChart data={a().usersByCountry} colorClass="bg-ktip-tropical-500" />
                </div>

                {/* Projects by Category */}
                <div class="border border-gray-200 rounded-lg p-6">
                  <div class="flex items-center gap-2 mb-4">
                    <FolderKanban size={18} class="text-indigo-600" />
                    <h2 class="text-sm font-semibold text-gray-900">Projects by Category</h2>
                  </div>
                  <BarChart data={a().projectsByCategory} colorClass="bg-indigo-500" />
                </div>

                {/* Projects by Phase */}
                <div class="border border-gray-200 rounded-lg p-6">
                  <div class="flex items-center gap-2 mb-4">
                    <BarChart3 size={18} class="text-purple-600" />
                    <h2 class="text-sm font-semibold text-gray-900">Projects by Phase</h2>
                  </div>
                  <BarChart data={a().projectsByPhase} colorClass="bg-purple-500" labelMap={PHASE_LABELS} />
                </div>

                {/* Events by Type */}
                <div class="border border-gray-200 rounded-lg p-6">
                  <div class="flex items-center gap-2 mb-4">
                    <Calendar size={18} class="text-ktip-tropical-600" />
                    <h2 class="text-sm font-semibold text-gray-900">Events by Type</h2>
                  </div>
                  <BarChart data={a().eventsByType} colorClass="bg-ktip-tropical-500" labelMap={EVENT_TYPE_LABELS} />
                </div>

                {/* Grant Application Pipeline */}
                <div class="border border-gray-200 rounded-lg p-6">
                  <div class="flex items-center gap-2 mb-4">
                    <DollarSign size={18} class="text-purple-600" />
                    <h2 class="text-sm font-semibold text-gray-900">Grant Application Pipeline</h2>
                  </div>
                  <BarChart data={a().grantPipeline} colorClass="bg-purple-500" labelMap={GRANT_APPLICATION_STATUS_LABELS} />
                </div>
              </div>
            </>
          )}
        </Show>
      </Suspense>

      {/* Quick Actions */}
      <div class="border border-gray-200 rounded-lg p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div class="flex flex-wrap gap-3">
          <A href="/events/new">
            <Button size="sm" icon={<Plus size={14} />}>
              Create Event
            </Button>
          </A>
          <A href="/admin/grants">
            <Button size="sm" variant="secondary" icon={<DollarSign size={14} />}>
              Manage Grants
            </Button>
          </A>
          <A href="/admin/resources">
            <Button size="sm" variant="secondary" icon={<BookOpen size={14} />}>
              Manage Resources
            </Button>
          </A>
          <A href="/admin/users">
            <Button size="sm" variant="outline" icon={<Users size={14} />}>
              Manage Users
            </Button>
          </A>
        </div>
      </div>

      {/* Navigation Cards */}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <A
          href="/admin/events"
          class="group border border-gray-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
                <Calendar size={20} class="text-ktip-ocean-600" />
              </div>
              <div>
                <h3 class="font-semibold text-gray-900">Events</h3>
                <p class="text-xs text-gray-500">Manage events, registrations & content</p>
              </div>
            </div>
            <ArrowRight size={16} class="text-gray-300 group-hover:text-ktip-ocean-500 transition-colors" />
          </div>
        </A>

        <A
          href="/admin/users"
          class="group border border-gray-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-ktip-tropical-100 flex items-center justify-center">
                <Users size={20} class="text-ktip-tropical-600" />
              </div>
              <div>
                <h3 class="font-semibold text-gray-900">Users</h3>
                <p class="text-xs text-gray-500">Manage roles, verification & profiles</p>
              </div>
            </div>
            <ArrowRight size={16} class="text-gray-300 group-hover:text-ktip-ocean-500 transition-colors" />
          </div>
        </A>

        <A
          href="/admin/grants"
          class="group border border-gray-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <DollarSign size={20} class="text-purple-600" />
              </div>
              <div>
                <h3 class="font-semibold text-gray-900">Grants</h3>
                <p class="text-xs text-gray-500">Create grants & review applications</p>
              </div>
            </div>
            <ArrowRight size={16} class="text-gray-300 group-hover:text-ktip-ocean-500 transition-colors" />
          </div>
        </A>

        <A
          href="/admin/forums"
          class="group border border-gray-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <MessageSquare size={20} class="text-yellow-600" />
              </div>
              <div>
                <h3 class="font-semibold text-gray-900">Forums</h3>
                <p class="text-xs text-gray-500">Moderate posts, pin content & manage boards</p>
              </div>
            </div>
            <ArrowRight size={16} class="text-gray-300 group-hover:text-ktip-ocean-500 transition-colors" />
          </div>
        </A>

        <A
          href="/admin/resources"
          class="group border border-gray-200 rounded-lg p-5 hover:border-ktip-ocean-300 transition-all"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <BookOpen size={20} class="text-orange-600" />
              </div>
              <div>
                <h3 class="font-semibold text-gray-900">Resources</h3>
                <p class="text-xs text-gray-500">Manage knowledge base articles & guides</p>
              </div>
            </div>
            <ArrowRight size={16} class="text-gray-300 group-hover:text-ktip-ocean-500 transition-colors" />
          </div>
        </A>
      </div>
    </>
  )
}

export default function AdminDashboardPage() {
  return (
    <AdminLayout>
      <AdminDashboardContent />
    </AdminLayout>
  )
}
