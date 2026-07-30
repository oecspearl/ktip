import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { formatDate, cn } from '../../../lib/utils'
import { PageHero } from '../../../components/layout/PageHero'
import { keys } from '../../../queries/keys'
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
} from 'lucide-react'

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

function DistributionBar(props: {
  counts: Record<string, number>
  labels: Record<string, string>
  total: number
  colorMap?: Record<string, string>
}) {
  const defaultColors: Record<string, string> = {
    very_useful: 'bg-ktip-tropical-500', somewhat: 'bg-ktip-sun-500', not_very: 'bg-ktip-sun-600', not_at_all: 'bg-red-500',
    yes: 'bg-ktip-tropical-500', no: 'bg-red-500',
    very_easy: 'bg-ktip-tropical-500', easy: 'bg-ktip-tropical-400', neutral: 'bg-ktip-sun-400', difficult: 'bg-ktip-sun-600', very_difficult: 'bg-red-500',
    excellent: 'bg-ktip-tropical-500', good: 'bg-ktip-tropical-400', average: 'bg-ktip-sun-400', poor: 'bg-ktip-sun-600', very_poor: 'bg-red-500',
    fast: 'bg-ktip-tropical-500', acceptable: 'bg-ktip-sun-500', slow: 'bg-red-500',
    true: 'bg-red-500', false: 'bg-ktip-tropical-500',
  }

  const colors = props.colorMap || defaultColors

  return (
    <div className="space-y-2">
      {Object.entries(props.counts)
        .sort(([, a], [, b]) => b - a)
        .map(([key, count]) => {
          const pct = props.total > 0 ? Math.round((count / props.total) * 100) : 0
          const label = props.labels[key] || key
          return (
            <div className="space-y-1" key={key}>
              <div className="flex justify-between text-xs">
                <span className="text-ktip-sand-700 font-medium">{label}</span>
                <span className="text-ktip-sand-500">{count} ({pct}%)</span>
              </div>
              <div className="h-2 bg-ktip-sand-100 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', colors[key] || 'bg-ktip-ocean-500')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
    </div>
  )
}

export default function AdminUATPage() {
  const { data: responses, isPending } = useQuery({
    queryKey: keys.list('uat-responses'),
    queryFn: fetchUATResponses,
  })

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const data = responses || []

  const avgRating = () => {
    if (data.length === 0) return '0'
    const sum = data.reduce((acc, r) => acc + r.q5_recommend_rating, 0)
    return (sum / data.length).toFixed(1)
  }

  const positiveExperience = () => {
    if (data.length === 0) return 0
    const positive = data.filter((r) => r.q8_overall_experience === 'excellent' || r.q8_overall_experience === 'good')
    return Math.round((positive.length / data.length) * 100)
  }

  const issueRate = () => {
    if (data.length === 0) return 0
    const withIssues = data.filter((r) => r.q9_issues)
    return Math.round((withIssues.length / data.length) * 100)
  }

  const exportCSV = () => {
    if (data.length === 0) return

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
      <PageHero
        inset
        compact
        eyebrow="Admin"
        title="Platform Feedback Results"
        subtitle="User feedback on usefulness and experience"
        imageSeed="admin-uat"
        actions={
          <button
            onClick={exportCSV}
            className="btn-brand flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          >
            <Download size={16} />
            Export CSV
          </button>
        }
      />

      {isPending ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div className="border border-ktip-sand-200 rounded-lg p-6 animate-pulse" key={n}>
              <div className="h-5 w-32 bg-ktip-sand-100 rounded mb-4" />
              <div className="space-y-3">
                <div className="h-3 w-full bg-ktip-sand-100 rounded" />
                <div className="h-3 w-3/4 bg-ktip-sand-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-children">
            <div className="border border-ktip-sand-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
                  <Users size={20} className="text-ktip-ocean-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{data.length}</p>
                  <p className="text-xs text-gray-500">Responses</p>
                </div>
              </div>
            </div>

            <div className="border border-ktip-sand-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-ktip-sun-100 flex items-center justify-center">
                  <Star size={20} className="text-ktip-sun-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{avgRating()}<span className="text-sm font-normal text-gray-400">/5</span></p>
                  <p className="text-xs text-gray-500">Avg Recommend</p>
                </div>
              </div>
            </div>

            <div className="border border-ktip-sand-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-ktip-tropical-100 flex items-center justify-center">
                  <TrendingUp size={20} className="text-ktip-tropical-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{positiveExperience()}%</p>
                  <p className="text-xs text-gray-500">Positive UX</p>
                </div>
              </div>
            </div>

            <div className="border border-ktip-sand-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <Zap size={20} className="text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{issueRate()}%</p>
                  <p className="text-xs text-gray-500">Reported Issues</p>
                </div>
              </div>
            </div>
          </div>

          {/* Distribution Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="border border-ktip-sand-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <BarChart3 size={16} className="text-ktip-ocean-600" />
                Q1: Platform Usefulness
              </h3>
              <DistributionBar counts={countValues(data, 'q1_usefulness')} labels={USEFULNESS_LABELS} total={data.length} />
            </div>

            <div className="border border-ktip-sand-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <BarChart3 size={16} className="text-ktip-tropical-600" />
                Q2: Most Valuable Features
              </h3>
              <DistributionBar counts={countFeatures(data)} labels={FEATURE_LABELS} total={data.length} colorMap={{
                projects: 'bg-ktip-ocean-500', events: 'bg-ktip-tropical-500', grants: 'bg-ktip-ocean-300',
                forums: 'bg-ktip-sun-500', collaboration: 'bg-ktip-ocean-700', directory: 'bg-ktip-sun-300',
                resources: 'bg-ktip-sun-700', proposals: 'bg-ktip-tropical-700',
              }} />
            </div>

            <div className="border border-ktip-sand-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <BarChart3 size={16} className="text-ktip-ocean-600" />
                Q3: Connecting Innovators
              </h3>
              <DistributionBar counts={countValues(data, 'q3_connect_innovators')} labels={CONNECT_LABELS} total={data.length} />
            </div>

            <div className="border border-ktip-sand-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <BarChart3 size={16} className="text-ktip-sun-700" />
                Q4: Discovering Opportunities
              </h3>
              <DistributionBar counts={countValues(data, 'q4_discover_opportunities')} labels={CONNECT_LABELS} total={data.length} />
            </div>

            <div className="border border-ktip-sand-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Star size={16} className="text-ktip-sun-600" />
                Q5: Recommendation Rating (1-5)
              </h3>
              <DistributionBar
                counts={countValues(data, 'q5_recommend_rating')}
                labels={{ '1': '1 - Not likely', '2': '2', '3': '3', '4': '4', '5': '5 - Very likely' }}
                total={data.length}
                colorMap={{ '1': 'bg-red-500', '2': 'bg-ktip-sun-600', '3': 'bg-ktip-sun-500', '4': 'bg-ktip-tropical-400', '5': 'bg-ktip-tropical-500' }}
              />
            </div>

            <div className="border border-ktip-sand-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <BarChart3 size={16} className="text-ktip-ocean-600" />
                Q6: Ease of Navigation
              </h3>
              <DistributionBar counts={countValues(data, 'q6_ease_of_navigation')} labels={NAVIGATION_LABELS} total={data.length} />
            </div>

            <div className="border border-ktip-sand-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <BarChart3 size={16} className="text-ktip-sun-600" />
                Q8: Overall Experience
              </h3>
              <DistributionBar counts={countValues(data, 'q8_overall_experience')} labels={EXPERIENCE_LABELS} total={data.length} />
            </div>

            <div className="border border-ktip-sand-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Zap size={16} className="text-ktip-tropical-700" />
                Q10: Performance
              </h3>
              <DistributionBar counts={countValues(data, 'q10_performance')} labels={PERFORMANCE_LABELS} total={data.length} />
            </div>
          </div>

          {/* Reported Issues */}
          <div className="border border-ktip-sand-200 rounded-lg p-5 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Zap size={18} className="text-red-600" />
              Reported Issues
            </h3>
            {data.some((r) => r.q9_issues && r.q9_issues_detail) ? (
              <div className="space-y-3">
                {data
                  .filter((r) => r.q9_issues && r.q9_issues_detail)
                  .map((r) => (
                    <div className="border border-red-100 rounded-xl p-4 bg-red-50/50" key={r.id}>
                      <p className="text-xs text-ktip-sand-500 mb-1">{formatDate(r.created_at, 'PPp')}</p>
                      <p className="text-sm text-gray-800">{r.q9_issues_detail}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-ktip-sand-500 italic">No issues reported yet.</p>
            )}
          </div>

          {/* Open-ended Feedback */}
          <div className="border border-ktip-sand-200 rounded-lg p-5 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare size={18} className="text-ktip-ocean-600" />
              Feature Requests & Comments
            </h3>
            {data.some((r) => r.q11_improvements || r.q12_comments) ? (
              <div className="space-y-3">
                {data
                  .filter((r) => r.q11_improvements || r.q12_comments)
                  .map((r) => (
                    <div className="border border-ktip-sand-100 rounded-xl p-4 bg-ktip-sand-50/50" key={r.id}>
                      <p className="text-xs text-ktip-sand-500 mb-2">{formatDate(r.created_at, 'PPp')}</p>
                      {r.q11_improvements && (
                        <div className="mb-2">
                          <p className="text-xs font-semibold text-ktip-sand-600 uppercase tracking-wider">Improvements Requested</p>
                          <p className="text-sm text-ktip-sand-800 mt-0.5">{r.q11_improvements}</p>
                        </div>
                      )}
                      {r.q12_comments && (
                        <div>
                          <p className="text-xs font-semibold text-ktip-sand-600 uppercase tracking-wider">Comments</p>
                          <p className="text-sm text-ktip-sand-800 mt-0.5">{r.q12_comments}</p>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-ktip-sand-500 italic">No open-ended feedback received yet.</p>
            )}
          </div>

          {/* Individual Responses */}
          <div className="border border-ktip-sand-200 rounded-lg p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Individual Responses ({data.length})
            </h3>
            <div className="space-y-2 stagger-children">
              {data.map((r, idx) => (
                <div className="border border-ktip-sand-100 rounded-xl overflow-hidden" key={r.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-ktip-sand-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white',
                        r.q5_recommend_rating >= 4 ? 'bg-ktip-tropical-500' :
                        r.q5_recommend_rating >= 3 ? 'bg-ktip-sun-500' : 'bg-red-500'
                      )}>
                        {r.q5_recommend_rating}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Response #{data.length - idx}
                        </p>
                        <p className="text-xs text-gray-500">{formatDate(r.created_at, 'PPp')}</p>
                      </div>
                    </div>
                    {expandedId === r.id ? (
                      <ChevronUp size={16} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={16} className="text-gray-400" />
                    )}
                  </button>
                  {expandedId === r.id && (
                    <div className="px-4 pb-4 border-t border-ktip-sand-100 pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div><span className="text-gray-500">Q1 Usefulness:</span> <span className="font-medium">{USEFULNESS_LABELS[r.q1_usefulness]}</span></div>
                        <div><span className="text-gray-500">Q2 Features:</span> <span className="font-medium">{r.q2_valuable_features.map((f) => FEATURE_LABELS[f] || f).join(', ')}</span></div>
                        <div><span className="text-gray-500">Q3 Connect:</span> <span className="font-medium">{CONNECT_LABELS[r.q3_connect_innovators]}</span></div>
                        <div><span className="text-gray-500">Q4 Opportunities:</span> <span className="font-medium">{CONNECT_LABELS[r.q4_discover_opportunities]}</span></div>
                        <div><span className="text-gray-500">Q5 Recommend:</span> <span className="font-medium">{r.q5_recommend_rating}/5</span></div>
                        <div><span className="text-gray-500">Q6 Navigation:</span> <span className="font-medium">{NAVIGATION_LABELS[r.q6_ease_of_navigation]}</span></div>
                        <div><span className="text-gray-500">Q7 Professional:</span> <span className="font-medium">{PROFESSIONAL_LABELS[r.q7_professional]}</span></div>
                        <div><span className="text-gray-500">Q8 Experience:</span> <span className="font-medium">{EXPERIENCE_LABELS[r.q8_overall_experience]}</span></div>
                        <div><span className="text-gray-500">Q9 Issues:</span> <span className="font-medium">{r.q9_issues ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-gray-500">Q10 Performance:</span> <span className="font-medium">{PERFORMANCE_LABELS[r.q10_performance]}</span></div>
                      </div>
                      {r.q9_issues_detail && (
                        <div className="mt-3 p-3 bg-red-50 rounded-lg">
                          <p className="text-xs font-semibold text-red-600">Issue Detail</p>
                          <p className="text-sm text-red-800 mt-1">{r.q9_issues_detail}</p>
                        </div>
                      )}
                      {r.q11_improvements && (
                        <div className="mt-2 p-3 bg-ktip-ocean-50 rounded-lg">
                          <p className="text-xs font-semibold text-ktip-ocean-700">Improvements</p>
                          <p className="text-sm text-ktip-ocean-800 mt-1">{r.q11_improvements}</p>
                        </div>
                      )}
                      {r.q12_comments && (
                        <div className="mt-2 p-3 bg-ktip-sand-50 rounded-lg">
                          <p className="text-xs font-semibold text-gray-600">Comments</p>
                          <p className="text-sm text-gray-800 mt-1">{r.q12_comments}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Empty state */}
          {data.length === 0 && (
            <div className="text-center py-16">
              <ClipboardCheck size={48} className="mx-auto text-ktip-sand-300 mb-4" />
              <h3 className="text-lg font-semibold text-ktip-sand-700">No responses yet</h3>
              <p className="text-sm text-ktip-sand-500 mt-1">
                Feedback responses will appear here once users start submitting them.
              </p>
            </div>
          )}
        </>
      )}
    </>
  )
}
