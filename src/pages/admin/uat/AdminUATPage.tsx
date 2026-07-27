import { createSignal, createResource, Show, For, Suspense } from 'solid-js'
import { AdminLayout } from '../../../components/layout/AdminLayout'
import { supabase } from '../../../lib/supabase'
import { formatDate } from '../../../lib/utils'
import {
  ClipboardCheck,
  BarChart3,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Star,
  TrendingUp,
  Users,
  Download,
  Zap,
} from 'lucide-solid'
import { cn } from '../../../lib/utils'

interface UATResponse {
  id: string
  q1_usefulness: string
  q2_valuable_features: string[]
  q3_connect_innovators: string
  q4_discover_opportunities: string
  q5_recommend_rating: number
  q6_ease_of_navigation: string
  q7_professional: string
  q8_overall_experience: string
  q9_issues: boolean
  q9_issues_detail: string | null
  q10_performance: string
  q11_improvements: string | null
  q12_comments: string | null
  created_at: string
}

const USEFULNESS_LABELS: Record<string, string> = {
  very_useful: 'Very useful',
  somewhat: 'Somewhat useful',
  not_very: 'Not very useful',
  not_at_all: 'Not at all useful',
}

const CONNECT_LABELS: Record<string, string> = {
  yes: 'Yes',
  somewhat: 'Somewhat',
  no: 'No',
}

const NAVIGATION_LABELS: Record<string, string> = {
  very_easy: 'Very easy',
  easy: 'Easy',
  neutral: 'Neutral',
  difficult: 'Difficult',
  very_difficult: 'Very difficult',
}

const PROFESSIONAL_LABELS: Record<string, string> = {
  yes: 'Yes',
  somewhat: 'Somewhat',
  no: 'No',
}

const EXPERIENCE_LABELS: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  average: 'Average',
  poor: 'Poor',
  very_poor: 'Very poor',
}

const PERFORMANCE_LABELS: Record<string, string> = {
  fast: 'Fast',
  acceptable: 'Acceptable',
  slow: 'Slow',
}

const FEATURE_LABELS: Record<string, string> = {
  projects: 'Projects',
  events: 'Events',
  grants: 'Grants',
  forums: 'Forums',
  collaboration: 'Collaboration',
  directory: 'Directory',
  resources: 'Resources',
  proposals: 'Proposals',
}

async function fetchUATResponses(): Promise<UATResponse[]> {
  const { data, error } = await supabase
    .from('uat_responses' as any)
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as unknown as UATResponse[]
}

function countValues(responses: UATResponse[], field: keyof UATResponse): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of responses) {
    const val = String(r[field] ?? 'N/A')
    counts[val] = (counts[val] || 0) + 1
  }
  return counts
}

function countFeatures(responses: UATResponse[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of responses) {
    for (const f of r.q2_valuable_features) {
      counts[f] = (counts[f] || 0) + 1
    }
  }
  return counts
}

function DistributionBar(props: { counts: Record<string, number>; labels: Record<string, string>; total: number; colorMap?: Record<string, string> }) {
  const defaultColors: Record<string, string> = {
    very_useful: 'bg-emerald-500', somewhat: 'bg-yellow-500', not_very: 'bg-orange-500', not_at_all: 'bg-red-500',
    yes: 'bg-emerald-500', no: 'bg-red-500',
    very_easy: 'bg-emerald-500', easy: 'bg-green-400', neutral: 'bg-yellow-400', difficult: 'bg-orange-500', very_difficult: 'bg-red-500',
    excellent: 'bg-emerald-500', good: 'bg-green-400', average: 'bg-yellow-400', poor: 'bg-orange-500', very_poor: 'bg-red-500',
    fast: 'bg-emerald-500', acceptable: 'bg-yellow-500', slow: 'bg-red-500',
    true: 'bg-red-500', false: 'bg-emerald-500',
  }

  const colors = props.colorMap || defaultColors

  return (
    <div class="space-y-2">
      <For each={Object.entries(props.counts).sort(([, a], [, b]) => b - a)}>
        {([key, count]) => {
          const pct = props.total > 0 ? Math.round((count / props.total) * 100) : 0
          const label = props.labels[key] || key
          return (
            <div class="space-y-1">
              <div class="flex justify-between text-xs">
                <span class="text-ktip-sand-700 font-medium">{label}</span>
                <span class="text-ktip-sand-500">{count} ({pct}%)</span>
              </div>
              <div class="h-2 bg-ktip-sand-100 rounded-full overflow-hidden">
                <div
                  class={cn('h-full rounded-full transition-all', colors[key] || 'bg-ktip-ocean-500')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        }}
      </For>
    </div>
  )
}

function AdminUATContent() {
  const [responses] = createResource(fetchUATResponses)
  const [expandedId, setExpandedId] = createSignal<string | null>(null)

  const avgRating = () => {
    const data = responses()
    if (!data || data.length === 0) return 0
    const sum = data.reduce((acc, r) => acc + r.q5_recommend_rating, 0)
    return (sum / data.length).toFixed(1)
  }

  const positiveExperience = () => {
    const data = responses()
    if (!data || data.length === 0) return 0
    const positive = data.filter((r) => r.q8_overall_experience === 'excellent' || r.q8_overall_experience === 'good')
    return Math.round((positive.length / data.length) * 100)
  }

  const issueRate = () => {
    const data = responses()
    if (!data || data.length === 0) return 0
    const withIssues = data.filter((r) => r.q9_issues)
    return Math.round((withIssues.length / data.length) * 100)
  }

  const exportCSV = () => {
    const data = responses()
    if (!data || data.length === 0) return

    const headers = [
      'Date', 'Q1 Usefulness', 'Q2 Valuable Features', 'Q3 Connect Innovators',
      'Q4 Discover Opportunities', 'Q5 Recommend (1-5)', 'Q6 Navigation',
      'Q7 Professional', 'Q8 Overall Experience', 'Q9 Issues', 'Q9 Issue Detail',
      'Q10 Performance', 'Q11 Improvements', 'Q12 Comments',
    ]

    const rows = data.map((r) => [
      formatDate(r.created_at, 'yyyy-MM-dd HH:mm'),
      USEFULNESS_LABELS[r.q1_usefulness] || r.q1_usefulness,
      r.q2_valuable_features.map((f) => FEATURE_LABELS[f] || f).join('; '),
      CONNECT_LABELS[r.q3_connect_innovators] || r.q3_connect_innovators,
      CONNECT_LABELS[r.q4_discover_opportunities] || r.q4_discover_opportunities,
      r.q5_recommend_rating,
      NAVIGATION_LABELS[r.q6_ease_of_navigation] || r.q6_ease_of_navigation,
      PROFESSIONAL_LABELS[r.q7_professional] || r.q7_professional,
      EXPERIENCE_LABELS[r.q8_overall_experience] || r.q8_overall_experience,
      r.q9_issues ? 'Yes' : 'No',
      r.q9_issues_detail || '',
      PERFORMANCE_LABELS[r.q10_performance] || r.q10_performance,
      r.q11_improvements || '',
      r.q12_comments || '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `uat-responses-${formatDate(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Header */}
      <div class="bg-gray-800 rounded-lg p-6 mb-8">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-400 uppercase tracking-wider">Admin</p>
            <h1 class="text-2xl font-bold font-display text-white mt-1">
              Platform Feedback Results
            </h1>
            <p class="mt-1 text-gray-400 text-sm">
              User feedback on usefulness and experience
            </p>
          </div>
          <button
            onClick={exportCSV}
            class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <Suspense
        fallback={
          <div class="space-y-4">
            {[1, 2, 3].map(() => (
              <div class="border border-gray-200 rounded-lg p-6 animate-pulse">
                <div class="h-5 w-32 bg-gray-100 rounded mb-4" />
                <div class="space-y-3">
                  <div class="h-3 w-full bg-gray-100 rounded" />
                  <div class="h-3 w-3/4 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        }
      >
        <Show when={responses()}>
          {(data) => (
            <>
              {/* Summary Stats */}
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
                      <Users size={20} class="text-ktip-ocean-600" />
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-gray-900">{data().length}</p>
                      <p class="text-xs text-gray-500">Responses</p>
                    </div>
                  </div>
                </div>

                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                      <Star size={20} class="text-yellow-600" />
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-gray-900">{avgRating()}<span class="text-sm font-normal text-gray-400">/5</span></p>
                      <p class="text-xs text-gray-500">Avg Recommend</p>
                    </div>
                  </div>
                </div>

                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-ktip-tropical-100 flex items-center justify-center">
                      <TrendingUp size={20} class="text-ktip-tropical-600" />
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-gray-900">{positiveExperience()}%</p>
                      <p class="text-xs text-gray-500">Positive UX</p>
                    </div>
                  </div>
                </div>

                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                      <Zap size={20} class="text-red-600" />
                    </div>
                    <div>
                      <p class="text-2xl font-bold text-gray-900">{issueRate()}%</p>
                      <p class="text-xs text-gray-500">Reported Issues</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Distribution Charts */}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div class="border border-gray-200 rounded-lg p-5">
                  <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <BarChart3 size={16} class="text-ktip-ocean-600" />
                    Q1: Platform Usefulness
                  </h3>
                  <DistributionBar counts={countValues(data(), 'q1_usefulness')} labels={USEFULNESS_LABELS} total={data().length} />
                </div>

                <div class="border border-gray-200 rounded-lg p-5">
                  <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <BarChart3 size={16} class="text-ktip-tropical-600" />
                    Q2: Most Valuable Features
                  </h3>
                  <DistributionBar counts={countFeatures(data())} labels={FEATURE_LABELS} total={data().length} colorMap={{
                    projects: 'bg-ktip-ocean-500', events: 'bg-ktip-tropical-500', grants: 'bg-purple-500',
                    forums: 'bg-yellow-500', collaboration: 'bg-indigo-500', directory: 'bg-pink-500',
                    resources: 'bg-orange-500', proposals: 'bg-teal-500',
                  }} />
                </div>

                <div class="border border-gray-200 rounded-lg p-5">
                  <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <BarChart3 size={16} class="text-purple-600" />
                    Q3: Connecting Innovators
                  </h3>
                  <DistributionBar counts={countValues(data(), 'q3_connect_innovators')} labels={CONNECT_LABELS} total={data().length} />
                </div>

                <div class="border border-gray-200 rounded-lg p-5">
                  <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <BarChart3 size={16} class="text-orange-600" />
                    Q4: Discovering Opportunities
                  </h3>
                  <DistributionBar counts={countValues(data(), 'q4_discover_opportunities')} labels={CONNECT_LABELS} total={data().length} />
                </div>

                <div class="border border-gray-200 rounded-lg p-5">
                  <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Star size={16} class="text-yellow-600" />
                    Q5: Recommendation Rating (1-5)
                  </h3>
                  <DistributionBar
                    counts={countValues(data(), 'q5_recommend_rating')}
                    labels={{ '1': '1 - Not likely', '2': '2', '3': '3', '4': '4', '5': '5 - Very likely' }}
                    total={data().length}
                    colorMap={{ '1': 'bg-red-500', '2': 'bg-orange-500', '3': 'bg-yellow-500', '4': 'bg-green-400', '5': 'bg-emerald-500' }}
                  />
                </div>

                <div class="border border-gray-200 rounded-lg p-5">
                  <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <BarChart3 size={16} class="text-indigo-600" />
                    Q6: Ease of Navigation
                  </h3>
                  <DistributionBar counts={countValues(data(), 'q6_ease_of_navigation')} labels={NAVIGATION_LABELS} total={data().length} />
                </div>

                <div class="border border-gray-200 rounded-lg p-5">
                  <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <BarChart3 size={16} class="text-pink-600" />
                    Q8: Overall Experience
                  </h3>
                  <DistributionBar counts={countValues(data(), 'q8_overall_experience')} labels={EXPERIENCE_LABELS} total={data().length} />
                </div>

                <div class="border border-gray-200 rounded-lg p-5">
                  <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Zap size={16} class="text-teal-600" />
                    Q10: Performance
                  </h3>
                  <DistributionBar counts={countValues(data(), 'q10_performance')} labels={PERFORMANCE_LABELS} total={data().length} />
                </div>
              </div>

              {/* Reported Issues */}
              <div class="border border-gray-200 rounded-lg p-5 mb-8">
                <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Zap size={18} class="text-red-600" />
                  Reported Issues
                </h3>
                <Show when={data().some((r) => r.q9_issues && r.q9_issues_detail)} fallback={
                  <p class="text-sm text-ktip-sand-500 italic">No issues reported yet.</p>
                }>
                  <div class="space-y-3">
                    <For each={data().filter((r) => r.q9_issues && r.q9_issues_detail)}>
                      {(r) => (
                        <div class="border border-red-100 rounded-xl p-4 bg-red-50/50">
                          <p class="text-xs text-ktip-sand-500 mb-1">{formatDate(r.created_at, 'PPp')}</p>
                          <p class="text-sm text-gray-800">{r.q9_issues_detail}</p>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>

              {/* Open-ended Feedback */}
              <div class="border border-gray-200 rounded-lg p-5 mb-8">
                <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <MessageSquare size={18} class="text-ktip-ocean-600" />
                  Feature Requests & Comments
                </h3>
                <Show when={data().some((r) => r.q11_improvements || r.q12_comments)} fallback={
                  <p class="text-sm text-ktip-sand-500 italic">No open-ended feedback received yet.</p>
                }>
                  <div class="space-y-3">
                    <For each={data().filter((r) => r.q11_improvements || r.q12_comments)}>
                      {(r) => (
                        <div class="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                          <p class="text-xs text-ktip-sand-500 mb-2">{formatDate(r.created_at, 'PPp')}</p>
                          <Show when={r.q11_improvements}>
                            <div class="mb-2">
                              <p class="text-xs font-semibold text-ktip-sand-600 uppercase tracking-wider">Improvements Requested</p>
                              <p class="text-sm text-ktip-sand-800 mt-0.5">{r.q11_improvements}</p>
                            </div>
                          </Show>
                          <Show when={r.q12_comments}>
                            <div>
                              <p class="text-xs font-semibold text-ktip-sand-600 uppercase tracking-wider">Comments</p>
                              <p class="text-sm text-ktip-sand-800 mt-0.5">{r.q12_comments}</p>
                            </div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>

              {/* Individual Responses */}
              <div class="border border-gray-200 rounded-lg p-5">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">
                  Individual Responses ({data().length})
                </h3>
                <div class="space-y-2">
                  <For each={data()}>
                    {(r) => (
                      <div class="border border-gray-100 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setExpandedId(expandedId() === r.id ? null : r.id)}
                          class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div class="flex items-center gap-3">
                            <div class={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white',
                              r.q5_recommend_rating >= 4 ? 'bg-emerald-500' :
                              r.q5_recommend_rating >= 3 ? 'bg-yellow-500' : 'bg-red-500'
                            )}>
                              {r.q5_recommend_rating}
                            </div>
                            <div>
                              <p class="text-sm font-medium text-gray-900">
                                Response #{data().length - data().indexOf(r)}
                              </p>
                              <p class="text-xs text-gray-500">{formatDate(r.created_at, 'PPp')}</p>
                            </div>
                          </div>
                          <Show when={expandedId() === r.id} fallback={<ChevronDown size={16} class="text-gray-400" />}>
                            <ChevronUp size={16} class="text-gray-400" />
                          </Show>
                        </button>
                        <Show when={expandedId() === r.id}>
                          <div class="px-4 pb-4 border-t border-gray-100 pt-3">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              <div><span class="text-gray-500">Q1 Usefulness:</span> <span class="font-medium">{USEFULNESS_LABELS[r.q1_usefulness]}</span></div>
                              <div><span class="text-gray-500">Q2 Features:</span> <span class="font-medium">{r.q2_valuable_features.map((f) => FEATURE_LABELS[f] || f).join(', ')}</span></div>
                              <div><span class="text-gray-500">Q3 Connect:</span> <span class="font-medium">{CONNECT_LABELS[r.q3_connect_innovators]}</span></div>
                              <div><span class="text-gray-500">Q4 Opportunities:</span> <span class="font-medium">{CONNECT_LABELS[r.q4_discover_opportunities]}</span></div>
                              <div><span class="text-gray-500">Q5 Recommend:</span> <span class="font-medium">{r.q5_recommend_rating}/5</span></div>
                              <div><span class="text-gray-500">Q6 Navigation:</span> <span class="font-medium">{NAVIGATION_LABELS[r.q6_ease_of_navigation]}</span></div>
                              <div><span class="text-gray-500">Q7 Professional:</span> <span class="font-medium">{PROFESSIONAL_LABELS[r.q7_professional]}</span></div>
                              <div><span class="text-gray-500">Q8 Experience:</span> <span class="font-medium">{EXPERIENCE_LABELS[r.q8_overall_experience]}</span></div>
                              <div><span class="text-gray-500">Q9 Issues:</span> <span class="font-medium">{r.q9_issues ? 'Yes' : 'No'}</span></div>
                              <div><span class="text-gray-500">Q10 Performance:</span> <span class="font-medium">{PERFORMANCE_LABELS[r.q10_performance]}</span></div>
                            </div>
                            <Show when={r.q9_issues_detail}>
                              <div class="mt-3 p-3 bg-red-50 rounded-lg">
                                <p class="text-xs font-semibold text-red-600">Issue Detail</p>
                                <p class="text-sm text-red-800 mt-1">{r.q9_issues_detail}</p>
                              </div>
                            </Show>
                            <Show when={r.q11_improvements}>
                              <div class="mt-2 p-3 bg-blue-50 rounded-lg">
                                <p class="text-xs font-semibold text-blue-700">Improvements</p>
                                <p class="text-sm text-blue-800 mt-1">{r.q11_improvements}</p>
                              </div>
                            </Show>
                            <Show when={r.q12_comments}>
                              <div class="mt-2 p-3 bg-gray-50 rounded-lg">
                                <p class="text-xs font-semibold text-gray-600">Comments</p>
                                <p class="text-sm text-gray-800 mt-1">{r.q12_comments}</p>
                              </div>
                            </Show>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              {/* Empty state */}
              <Show when={data().length === 0}>
                <div class="text-center py-16">
                  <ClipboardCheck size={48} class="mx-auto text-ktip-sand-300 mb-4" />
                  <h3 class="text-lg font-semibold text-ktip-sand-700">No responses yet</h3>
                  <p class="text-sm text-ktip-sand-500 mt-1">
                    Feedback responses will appear here once users start submitting them.
                  </p>
                </div>
              </Show>
            </>
          )}
        </Show>
      </Suspense>
    </>
  )
}

export default function AdminUATPage() {
  return (
    <AdminLayout>
      <AdminUATContent />
    </AdminLayout>
  )
}
