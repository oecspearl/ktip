import { useAnalyticsData, type DateRange } from '../../../hooks/useAnalyticsData'
import { PageHero } from '../../../components/layout/PageHero'
import {
  BarChart3,
  Eye,
  Users,
  MousePointer,
  Target,
  Activity,
  ArrowRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
    loading,
  } = useAnalyticsData()

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Usage Analytics"
        subtitle="Track page views, feature usage, funnels, and conversions"
        imageSeed="admin-analytics"
        actions={
          <div className="flex gap-1 bg-gray-800 p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  range === opt.value
                    ? 'bg-ktip-ocean-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <div className="text-gray-400 py-12 text-center">Loading analytics...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={Eye} label="Total Events" value={totalEvents ?? 0} />
            <StatCard icon={Users} label="Unique Sessions" value={uniqueSessions ?? 0} />
            <StatCard icon={MousePointer} label="Top Pages Tracked" value={topPages?.length ?? 0} />
            <StatCard icon={Target} label="Conversions" value={conversions?.reduce((s, c) => s + c.count, 0) ?? 0} />
          </div>

          {/* Daily Page Views Chart */}
          <div className="bg-gray-900 border border-gray-800 p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Activity size={20} className="text-ktip-ocean-500" />
              Daily Page Views
            </h2>
            {dailyPageViews?.length ? (
              <div className="flex items-end gap-1 h-40">
                {dailyPageViews.map((day) => {
                  const max = Math.max(...(dailyPageViews || []).map(d => d.count), 1)
                  const pct = (day.count / max) * 100
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative" title={`${day.date}: ${day.count} views`}>
                      <div
                        className="w-full bg-ktip-ocean-600 min-h-[2px] transition-all hover:bg-ktip-ocean-400"
                        style={{ height: `${pct}%` }}
                      />
                      <span className="text-[10px] text-gray-600 hidden group-hover:block absolute -bottom-5">
                        {day.date.slice(5)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No data yet</p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Top Pages */}
            <div className="bg-gray-900 border border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Eye size={20} className="text-ktip-ocean-500" />
                Top Pages
              </h2>
              {topPages?.length ? (
                <div className="space-y-2">
                  {topPages.map((page, i) => {
                    const max = topPages?.[0]?.count || 1
                    const pct = (page.count / max) * 100
                    return (
                      <div key={page.path} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-5 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm text-gray-300 truncate">{page.path}</span>
                            <span className="text-sm text-white font-medium ml-2">{page.count}</span>
                          </div>
                          <div className="h-1.5 bg-gray-800">
                            <div className="h-full bg-ktip-ocean-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No data yet</p>
              )}
            </div>

            {/* Feature Usage */}
            <div className="bg-gray-900 border border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 size={20} className="text-ktip-tropical-500" />
                Feature Usage
              </h2>
              {featureUsage?.length ? (
                <div className="space-y-2">
                  {featureUsage.map((feat, i) => {
                    const max = featureUsage?.[0]?.count || 1
                    const pct = (feat.count / max) * 100
                    return (
                      <div key={`${feat.feature}-${feat.action}-${i}`} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm text-gray-300 truncate">
                              <span className="text-ktip-tropical-400">{feat.feature}</span>
                              {feat.action && (
                                <span className="text-gray-500"> : {feat.action}</span>
                              )}
                            </span>
                            <span className="text-sm text-white font-medium ml-2">{feat.count}</span>
                          </div>
                          <div className="h-1.5 bg-gray-800">
                            <div className="h-full bg-ktip-tropical-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No data yet</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Pre-Registration Funnel */}
            <div className="bg-gray-900 border border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Target size={20} className="text-ktip-sun-500" />
                Pre-Registration Funnel
              </h2>
              {preregFunnel?.some(s => s.count > 0) ? (
                <div className="space-y-3">
                  {preregFunnel
                    ?.filter(s => s.step !== 'modal_dismissed')
                    .map((step, i) => {
                      const firstCount = preregFunnel?.[0]?.count || 1
                      const pct = firstCount > 0 ? Math.round((step.count / firstCount) * 100) : 0
                      return (
                        <div key={step.step}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {i > 0 && <ArrowRight size={12} className="text-gray-600" />}
                              <span className="text-sm text-gray-300">{FUNNEL_LABELS[step.step] || step.step}</span>
                            </div>
                            <span className="text-sm text-white font-medium">{step.count} <span className="text-gray-500 text-xs">({pct}%)</span></span>
                          </div>
                          <div className="h-2 bg-gray-800">
                            <div className="h-full bg-ktip-sun-600 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  {/* Dismissed separately */}
                  {(() => {
                    const dismissed = preregFunnel?.find(s => s.step === 'modal_dismissed')
                    if (!dismissed) return null
                    return (
                      <div className="pt-2 border-t border-gray-800">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Dismissed</span>
                          <span className="text-sm text-gray-400">{dismissed.count}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No funnel data yet</p>
              )}
            </div>

            {/* Conversions */}
            <div className="bg-gray-900 border border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Target size={20} className="text-ktip-tropical-500" />
                Conversions
              </h2>
              {conversions?.length ? (
                <div className="space-y-3">
                  {conversions.map((conv) => (
                    <div key={conv.name} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <span className="text-sm text-gray-300">{CONVERSION_LABELS[conv.name] || conv.name}</span>
                      <span className="text-lg font-bold text-white">{conv.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No conversions yet</p>
              )}
            </div>
          </div>

          {/* User Journeys / Recent Sessions */}
          <div className="bg-gray-900 border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Users size={20} className="text-ktip-ocean-500" />
              Recent User Journeys
            </h2>
            {recentSessions?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-left border-b border-gray-800">
                      <th className="pb-2 pr-4">Session</th>
                      <th className="pb-2 pr-4">User</th>
                      <th className="pb-2 pr-4">Pages</th>
                      <th className="pb-2 pr-4">Started</th>
                      <th className="pb-2">Journey</th>
                    </tr>
                  </thead>
                  <tbody className="stagger-rows">
                    {recentSessions.slice(0, 25).map((session) => (
                      <tr key={session.session_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-2 pr-4 text-gray-400 font-mono text-xs">{session.session_id.slice(0, 8)}</td>
                        <td className="py-2 pr-4">
                          {session.user_id ? (
                            <span className="text-gray-300 font-mono text-xs">{session.user_id.slice(0, 8)}</span>
                          ) : (
                            <span className="text-gray-600">Anonymous</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-white font-medium">{session.page_count}</td>
                        <td className="py-2 pr-4 text-gray-400 text-xs">
                          {new Date(session.started_at).toLocaleString()}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            {session.pages.slice(0, 6).map((page, i) => (
                              <span key={i} className="flex items-center gap-1">
                                {i > 0 && <ArrowRight size={10} className="text-gray-700 shrink-0" />}
                                <span className="text-xs bg-gray-800 text-gray-300 px-1.5 py-0.5 truncate max-w-[120px]">
                                  {page}
                                </span>
                              </span>
                            ))}
                            {session.pages.length > 6 && (
                              <span className="text-xs text-gray-600">+{session.pages.length - 6} more</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No session data yet</p>
            )}
          </div>
        </>
      )}
    </>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="bg-gray-900 border border-gray-800 p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-800 flex items-center justify-center">
          <Icon size={20} className="text-ktip-ocean-500" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  )
}
