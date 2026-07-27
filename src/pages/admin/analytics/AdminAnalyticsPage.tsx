import { Show, For, Suspense } from 'solid-js'
import { AdminLayout } from '../../../components/layout/AdminLayout'
import { useAnalyticsData, type DateRange } from '../../../hooks/useAnalyticsData'
import {
  BarChart3,
  Eye,
  Users,
  MousePointer,
  Target,
  Activity,
  ArrowRight,
} from 'lucide-solid'

const RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
]

const FUNNEL_LABELS: Record<string, string> = {
  modal_auto_opened: 'Modal Auto-Opened',
  modal_cta_opened: 'CTA Clicked',
  step_1_complete: 'Step 1 Complete',
  submit_attempt: 'Submit Attempted',
  modal_dismissed: 'Modal Dismissed',
}

const CONVERSION_LABELS: Record<string, string> = {
  prereg_submitted: 'Pre-Registration Submitted',
  login_success: 'Login',
  signup_success: 'Signup',
}

export default function AdminAnalyticsPage() {
  const {
    range,
    setRange,
    totalEvents,
    uniqueSessions,
    topPages,
    dailyPageViews,
    featureUsage,
    preregFunnel,
    conversions,
    recentSessions,
  } = useAnalyticsData()

  return (
    <AdminLayout>
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 class="text-2xl font-display font-bold text-white">Usage Analytics</h1>
          <p class="text-gray-400 text-sm mt-1">Track page views, feature usage, funnels, and conversions</p>
        </div>
        <div class="flex gap-1 bg-gray-800 p-1">
          <For each={RANGE_OPTIONS}>
            {(opt) => (
              <button
                onClick={() => setRange(opt.value)}
                class={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  range() === opt.value
                    ? 'bg-ktip-ocean-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <Suspense fallback={<div class="text-gray-400 py-12 text-center">Loading analytics...</div>}>
        {/* Summary Cards */}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Eye} label="Total Events" value={totalEvents() ?? 0} />
          <StatCard icon={Users} label="Unique Sessions" value={uniqueSessions() ?? 0} />
          <StatCard icon={MousePointer} label="Top Pages Tracked" value={topPages()?.length ?? 0} />
          <StatCard icon={Target} label="Conversions" value={conversions()?.reduce((s, c) => s + c.count, 0) ?? 0} />
        </div>

        {/* Daily Page Views Chart */}
        <div class="bg-gray-900 border border-gray-800 p-6 mb-6">
          <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Activity size={20} class="text-ktip-ocean-500" />
            Daily Page Views
          </h2>
          <Show when={dailyPageViews()?.length} fallback={<p class="text-gray-500 text-sm">No data yet</p>}>
            <div class="flex items-end gap-1 h-40">
              <For each={dailyPageViews()}>
                {(day) => {
                  const max = Math.max(...(dailyPageViews() || []).map(d => d.count), 1)
                  const pct = (day.count / max) * 100
                  return (
                    <div class="flex-1 flex flex-col items-center gap-1 group relative" title={`${day.date}: ${day.count} views`}>
                      <div
                        class="w-full bg-ktip-ocean-600 min-h-[2px] transition-all hover:bg-ktip-ocean-400"
                        style={{ height: `${pct}%` }}
                      />
                      <span class="text-[10px] text-gray-600 hidden group-hover:block absolute -bottom-5">
                        {day.date.slice(5)}
                      </span>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Top Pages */}
          <div class="bg-gray-900 border border-gray-800 p-6">
            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Eye size={20} class="text-ktip-ocean-500" />
              Top Pages
            </h2>
            <Show when={topPages()?.length} fallback={<p class="text-gray-500 text-sm">No data yet</p>}>
              <div class="space-y-2">
                <For each={topPages()}>
                  {(page, i) => {
                    const max = topPages()?.[0]?.count || 1
                    const pct = (page.count / max) * 100
                    return (
                      <div class="flex items-center gap-3">
                        <span class="text-xs text-gray-500 w-5 text-right">{i() + 1}</span>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center justify-between mb-0.5">
                            <span class="text-sm text-gray-300 truncate">{page.path}</span>
                            <span class="text-sm text-white font-medium ml-2">{page.count}</span>
                          </div>
                          <div class="h-1.5 bg-gray-800">
                            <div class="h-full bg-ktip-ocean-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </Show>
          </div>

          {/* Feature Usage */}
          <div class="bg-gray-900 border border-gray-800 p-6">
            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 size={20} class="text-ktip-tropical-500" />
              Feature Usage
            </h2>
            <Show when={featureUsage()?.length} fallback={<p class="text-gray-500 text-sm">No data yet</p>}>
              <div class="space-y-2">
                <For each={featureUsage()}>
                  {(feat) => {
                    const max = featureUsage()?.[0]?.count || 1
                    const pct = (feat.count / max) * 100
                    return (
                      <div class="flex items-center gap-3">
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center justify-between mb-0.5">
                            <span class="text-sm text-gray-300 truncate">
                              <span class="text-ktip-tropical-400">{feat.feature}</span>
                              <Show when={feat.action}>
                                <span class="text-gray-500"> : {feat.action}</span>
                              </Show>
                            </span>
                            <span class="text-sm text-white font-medium ml-2">{feat.count}</span>
                          </div>
                          <div class="h-1.5 bg-gray-800">
                            <div class="h-full bg-ktip-tropical-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </Show>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Pre-Registration Funnel */}
          <div class="bg-gray-900 border border-gray-800 p-6">
            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Target size={20} class="text-amber-500" />
              Pre-Registration Funnel
            </h2>
            <Show when={preregFunnel()?.some(s => s.count > 0)} fallback={<p class="text-gray-500 text-sm">No funnel data yet</p>}>
              <div class="space-y-3">
                <For each={preregFunnel()?.filter(s => s.step !== 'modal_dismissed')}>
                  {(step, i) => {
                    const firstCount = preregFunnel()?.[0]?.count || 1
                    const pct = firstCount > 0 ? Math.round((step.count / firstCount) * 100) : 0
                    return (
                      <div>
                        <div class="flex items-center justify-between mb-1">
                          <div class="flex items-center gap-2">
                            <Show when={i() > 0}>
                              <ArrowRight size={12} class="text-gray-600" />
                            </Show>
                            <span class="text-sm text-gray-300">{FUNNEL_LABELS[step.step] || step.step}</span>
                          </div>
                          <span class="text-sm text-white font-medium">{step.count} <span class="text-gray-500 text-xs">({pct}%)</span></span>
                        </div>
                        <div class="h-2 bg-gray-800">
                          <div class="h-full bg-amber-600 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  }}
                </For>
                {/* Dismissed separately */}
                <Show when={preregFunnel()?.find(s => s.step === 'modal_dismissed')}>
                  {(dismissed) => (
                    <div class="pt-2 border-t border-gray-800">
                      <div class="flex items-center justify-between">
                        <span class="text-sm text-gray-500">Dismissed</span>
                        <span class="text-sm text-gray-400">{dismissed().count}</span>
                      </div>
                    </div>
                  )}
                </Show>
              </div>
            </Show>
          </div>

          {/* Conversions */}
          <div class="bg-gray-900 border border-gray-800 p-6">
            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Target size={20} class="text-ktip-tropical-500" />
              Conversions
            </h2>
            <Show when={conversions()?.length} fallback={<p class="text-gray-500 text-sm">No conversions yet</p>}>
              <div class="space-y-3">
                <For each={conversions()}>
                  {(conv) => (
                    <div class="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <span class="text-sm text-gray-300">{CONVERSION_LABELS[conv.name] || conv.name}</span>
                      <span class="text-lg font-bold text-white">{conv.count}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>

        {/* User Journeys / Recent Sessions */}
        <div class="bg-gray-900 border border-gray-800 p-6">
          <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Users size={20} class="text-ktip-ocean-500" />
            Recent User Journeys
          </h2>
          <Show when={recentSessions()?.length} fallback={<p class="text-gray-500 text-sm">No session data yet</p>}>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-gray-500 text-left border-b border-gray-800">
                    <th class="pb-2 pr-4">Session</th>
                    <th class="pb-2 pr-4">User</th>
                    <th class="pb-2 pr-4">Pages</th>
                    <th class="pb-2 pr-4">Started</th>
                    <th class="pb-2">Journey</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={recentSessions()?.slice(0, 25)}>
                    {(session) => (
                      <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td class="py-2 pr-4 text-gray-400 font-mono text-xs">{session.session_id.slice(0, 8)}</td>
                        <td class="py-2 pr-4">
                          <Show when={session.user_id} fallback={<span class="text-gray-600">Anonymous</span>}>
                            <span class="text-gray-300 font-mono text-xs">{session.user_id!.slice(0, 8)}</span>
                          </Show>
                        </td>
                        <td class="py-2 pr-4 text-white font-medium">{session.page_count}</td>
                        <td class="py-2 pr-4 text-gray-400 text-xs">
                          {new Date(session.started_at).toLocaleString()}
                        </td>
                        <td class="py-2">
                          <div class="flex items-center gap-1 flex-wrap">
                            <For each={session.pages.slice(0, 6)}>
                              {(page, i) => (
                                <>
                                  <Show when={i() > 0}>
                                    <ArrowRight size={10} class="text-gray-700 shrink-0" />
                                  </Show>
                                  <span class="text-xs bg-gray-800 text-gray-300 px-1.5 py-0.5 truncate max-w-[120px]">
                                    {page}
                                  </span>
                                </>
                              )}
                            </For>
                            <Show when={session.pages.length > 6}>
                              <span class="text-xs text-gray-600">+{session.pages.length - 6} more</span>
                            </Show>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </div>
      </Suspense>
    </AdminLayout>
  )
}

function StatCard(props: { icon: any; label: string; value: number }) {
  return (
    <div class="bg-gray-900 border border-gray-800 p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-gray-800 flex items-center justify-center">
          <props.icon size={20} class="text-ktip-ocean-500" />
        </div>
        <div>
          <p class="text-2xl font-bold text-white">{props.value.toLocaleString()}</p>
          <p class="text-xs text-gray-500">{props.label}</p>
        </div>
      </div>
    </div>
  )
}
