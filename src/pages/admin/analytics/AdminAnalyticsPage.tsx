import { useAnalyticsData, type DateRange } from '../../../hooks/useAnalyticsData'
import { useAnalyticsConsent } from '../../../lib/analytics-consent'
import { PageHero } from '../../../components/layout/PageHero'
import { Card } from '../../../components/ui/Card'
import {
  BarChart3,
  Eye,
  Users,
  MousePointer,
  Target,
  Activity,
  ArrowRight,
  AlertTriangle,
  Info,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Surfaces here are ktip tokens (cream panels, sand text), not raw gray-800/900.
 * The gray scale inverts under html.dark, so the old hardcoded dark panels were
 * a black page in light mode and — worse — flipped to white-on-white at night.
 * Every colour below reads correctly in both modes with no dark: overrides.
 */

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

const PANEL_HEADING = 'text-lg font-semibold text-ktip-sand-900 mb-4 flex items-center gap-2'

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
    error,
  } = useAnalyticsData()

  // Ingestion is consent-gated (see AnalyticsProvider), so an empty table is a
  // normal state and not a fault. The admin's own consent is shown because it
  // is the one setting they can check from here — and on a small pilot it is
  // very often the reason the table is empty.
  const consent = useAnalyticsConsent()
  const isEmpty = !error && totalEvents === 0

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
          // Sits on the hero photo, which is dark in both modes — hence the
          // translucent black shell and white type rather than page tokens.
          <div className="flex gap-1 rounded-lg bg-black/30 backdrop-blur-sm p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  range === opt.value
                    ? 'bg-ktip-ocean-600 text-white dark:bg-ktip-ocean-200'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <div className="text-ktip-sand-500 py-12 text-center">Loading analytics...</div>
      ) : error ? (
        // Never again render a failed read as a page of zeros.
        <Card className="mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <h2 className="font-semibold text-ktip-sand-900">Analytics could not be read</h2>
              <p className="mt-1 text-sm text-ktip-sand-600">
                The events table refused the query, so no figure on this page would be true. This
                is not the same as "no activity".
              </p>
              <p className="mt-2 font-mono text-xs text-ktip-sand-500">{error.message}</p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {isEmpty && (
            <Card className="mb-6">
              <div className="flex items-start gap-3">
                <Info size={20} className="mt-0.5 shrink-0 text-ktip-ocean-600" />
                <div>
                  <h2 className="font-semibold text-ktip-sand-900">
                    No events recorded in this period
                  </h2>
                  <p className="mt-1 text-sm text-ktip-sand-600">
                    The query succeeded — the table is genuinely empty for the selected range.
                    Usage events are only written for visitors who accepted the analytics banner,
                    so a platform in pilot with few acceptances records nothing here even while it
                    is being used.
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-ktip-sand-600 list-disc pl-5">
                    <li>
                      Your own browser: analytics consent is{' '}
                      <span className="font-medium text-ktip-sand-900">{consent}</span>
                      {consent !== 'granted' && ' — your own visits are not being counted'}.
                    </li>
                    <li>Try "All time" above before concluding there is no traffic.</li>
                    <li>
                      Member counts, active days and the roadmap KPIs do not come from this table —
                      they are on the Pulse and Impact pages and need no consent.
                    </li>
                  </ul>
                </div>
              </div>
            </Card>
          )}
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={Eye} label="Total Events" value={totalEvents ?? 0} />
            <StatCard icon={Users} label="Unique Sessions" value={uniqueSessions ?? 0} />
            <StatCard icon={MousePointer} label="Top Pages Tracked" value={topPages?.length ?? 0} />
            <StatCard icon={Target} label="Conversions" value={conversions?.reduce((s, c) => s + c.count, 0) ?? 0} />
          </div>

          {/* Daily Page Views Chart */}
          <Card className="mb-6">
            <h2 className={PANEL_HEADING}>
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
                      <span className="text-[10px] text-ktip-sand-500 hidden group-hover:block absolute -bottom-5">
                        {day.date.slice(5)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-ktip-sand-500 text-sm">No data yet</p>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Top Pages */}
            <Card>
              <h2 className={PANEL_HEADING}>
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
                        <span className="text-xs text-ktip-sand-500 w-5 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm text-ktip-sand-700 truncate">{page.path}</span>
                            <span className="text-sm text-ktip-sand-900 font-medium ml-2">{page.count}</span>
                          </div>
                          <div className="h-1.5 bg-ktip-sand-200">
                            <div className="h-full bg-ktip-ocean-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-ktip-sand-500 text-sm">No data yet</p>
              )}
            </Card>

            {/* Feature Usage */}
            <Card>
              <h2 className={PANEL_HEADING}>
                <BarChart3 size={20} className="text-ktip-tropical-700 dark:text-ktip-tropical-500" />
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
                            <span className="text-sm text-ktip-sand-700 truncate">
                              {/* Brand green only carries as text from 700 up on
                                  a light surface (500 is 1.7:1) */}
                              <span className="text-ktip-tropical-800 dark:text-ktip-tropical-500">{feat.feature}</span>
                              {feat.action && (
                                <span className="text-ktip-sand-500"> : {feat.action}</span>
                              )}
                            </span>
                            <span className="text-sm text-ktip-sand-900 font-medium ml-2">{feat.count}</span>
                          </div>
                          <div className="h-1.5 bg-ktip-sand-200">
                            <div className="h-full bg-ktip-tropical-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-ktip-sand-500 text-sm">No data yet</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Pre-Registration Funnel */}
            <Card>
              <h2 className={PANEL_HEADING}>
                <Target size={20} className="text-ktip-sun-700 dark:text-ktip-sun-500" />
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
                              {i > 0 && <ArrowRight size={12} className="text-ktip-sand-400" />}
                              <span className="text-sm text-ktip-sand-700">{FUNNEL_LABELS[step.step] || step.step}</span>
                            </div>
                            <span className="text-sm text-ktip-sand-900 font-medium">{step.count} <span className="text-ktip-sand-500 text-xs">({pct}%)</span></span>
                          </div>
                          <div className="h-2 bg-ktip-sand-200">
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
                      <div className="pt-2 border-t border-ktip-sand-200">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-ktip-sand-500">Dismissed</span>
                          <span className="text-sm text-ktip-sand-600">{dismissed.count}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <p className="text-ktip-sand-500 text-sm">No funnel data yet</p>
              )}
            </Card>

            {/* Conversions */}
            <Card>
              <h2 className={PANEL_HEADING}>
                <Target size={20} className="text-ktip-tropical-700 dark:text-ktip-tropical-500" />
                Conversions
              </h2>
              {conversions?.length ? (
                <div className="space-y-3">
                  {conversions.map((conv) => (
                    <div key={conv.name} className="flex items-center justify-between py-2 border-b border-ktip-sand-200 last:border-0">
                      <span className="text-sm text-ktip-sand-700">{CONVERSION_LABELS[conv.name] || conv.name}</span>
                      <span className="text-lg font-bold text-ktip-sand-900">{conv.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-ktip-sand-500 text-sm">No conversions yet</p>
              )}
            </Card>
          </div>

          {/* User Journeys / Recent Sessions */}
          <Card>
            <h2 className={PANEL_HEADING}>
              <Users size={20} className="text-ktip-ocean-500" />
              Recent User Journeys
            </h2>
            {recentSessions?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-ktip-sand-500 text-left border-b border-ktip-sand-200">
                      <th className="pb-2 pr-4">Session</th>
                      <th className="pb-2 pr-4">User</th>
                      <th className="pb-2 pr-4">Pages</th>
                      <th className="pb-2 pr-4">Started</th>
                      <th className="pb-2">Journey</th>
                    </tr>
                  </thead>
                  <tbody className="stagger-rows">
                    {recentSessions.slice(0, 25).map((session) => (
                      <tr key={session.session_id} className="border-b border-ktip-sand-100 hover:bg-ktip-sand-50">
                        <td className="py-2 pr-4 text-ktip-sand-600 font-mono text-xs">{session.session_id.slice(0, 8)}</td>
                        <td className="py-2 pr-4">
                          {session.user_id ? (
                            <span className="text-ktip-sand-700 font-mono text-xs">{session.user_id.slice(0, 8)}</span>
                          ) : (
                            <span className="text-ktip-sand-500">Anonymous</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-ktip-sand-900 font-medium">{session.page_count}</td>
                        <td className="py-2 pr-4 text-ktip-sand-600 text-xs">
                          {new Date(session.started_at).toLocaleString()}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            {session.pages.slice(0, 6).map((page, i) => (
                              <span key={i} className="flex items-center gap-1">
                                {i > 0 && <ArrowRight size={10} className="text-ktip-sand-400 shrink-0" />}
                                <span className="text-xs bg-ktip-sand-100 text-ktip-sand-700 px-1.5 py-0.5 truncate max-w-[120px]">
                                  {page}
                                </span>
                              </span>
                            ))}
                            {session.pages.length > 6 && (
                              <span className="text-xs text-ktip-sand-500">+{session.pages.length - 6} more</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-ktip-sand-500 text-sm">No session data yet</p>
            )}
          </Card>
        </>
      )}
    </>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <Card padding="sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-ktip-ocean-50 flex items-center justify-center">
          <Icon size={20} className="text-ktip-ocean-500" />
        </div>
        <div>
          <p className="text-2xl font-bold text-ktip-sand-900">{value.toLocaleString()}</p>
          <p className="text-xs text-ktip-sand-500">{label}</p>
        </div>
      </div>
    </Card>
  )
}
