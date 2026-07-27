import { Show, For, Suspense } from 'solid-js'
import { A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Card } from '../../components/ui/Card'
import { useMyGrievances } from '../../hooks/useGrievances'
import { useAuth } from '../../contexts/AuthContext'
import {
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_CATEGORY_COLORS,
  GRIEVANCE_STATUS_LABELS,
  GRIEVANCE_STATUS_COLORS,
} from '../../lib/constants'
import { formatDate, getInitials, generateAvatarColor } from '../../lib/utils'
import { ChevronRight, ShieldAlert, Clock } from 'lucide-solid'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function MyGrievancesPage() {
  const auth = useAuth()
  const { grievances } = useMyGrievances(() => auth.user()?.id)

  usePageTitle(() => 'My Reports')

  return (
    <MainLayout>
      {/* Dark Hero */}
      <div class="bg-gray-800">
        <div class="container mx-auto px-4 py-6">
          <nav class="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
            <A href="/" class="hover:text-white transition-colors">Home</A>
            <ChevronRight size={14} class="text-gray-500" />
            <span class="text-gray-200">My Reports</span>
          </nav>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-ktip-ocean-500/20 flex items-center justify-center">
              <ShieldAlert size={20} class="text-ktip-ocean-400" />
            </div>
            <div>
              <h1 class="text-2xl font-display font-bold text-white">My Reports</h1>
              <p class="text-gray-400 text-sm">Track the status of your submitted reports</p>
            </div>
          </div>
        </div>
      </div>

      <div class="container mx-auto px-4 py-8 max-w-3xl">
        <Suspense
          fallback={
            <div class="space-y-4">
              <div class="bg-white rounded-2xl shadow-card border border-ktip-sand-100 p-6 animate-pulse-soft h-32" />
              <div class="bg-white rounded-2xl shadow-card border border-ktip-sand-100 p-6 animate-pulse-soft h-32" />
            </div>
          }
        >
          <Show
            when={grievances() && grievances()!.length > 0}
            fallback={
              <div class="text-center py-16">
                <div class="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShieldAlert size={32} class="text-ktip-sand-400" />
                </div>
                <h2 class="text-xl font-display font-bold text-ktip-sand-900 mb-2">No reports submitted</h2>
                <p class="text-ktip-sand-600">You haven't submitted any reports yet. If you encounter inappropriate behavior, you can report a user from their profile page.</p>
              </div>
            }
          >
            <div class="space-y-4">
              <For each={grievances()}>
                {(grievance) => {
                  const reportedName = () => grievance.reported_user?.display_name || 'Unknown User'

                  return (
                    <Card>
                      <div class="flex flex-col sm:flex-row sm:items-start gap-4">
                        {/* Reported User Avatar */}
                        <div
                          class={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${generateAvatarColor(reportedName())}`}
                        >
                          {getInitials(reportedName())}
                        </div>

                        {/* Content */}
                        <div class="flex-1 min-w-0">
                          <div class="flex flex-wrap items-center gap-2 mb-2">
                            <span class="font-semibold text-ktip-sand-900">{reportedName()}</span>
                            <span
                              class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${GRIEVANCE_CATEGORY_COLORS[grievance.category] || 'bg-gray-100 text-gray-700 border-gray-200'}`}
                            >
                              {GRIEVANCE_CATEGORY_LABELS[grievance.category] || grievance.category}
                            </span>
                          </div>

                          <p class="text-ktip-sand-600 text-sm line-clamp-3 mb-3">
                            {grievance.description}
                          </p>

                          <div class="flex flex-wrap items-center gap-3 text-xs text-ktip-sand-500">
                            <span
                              class={`inline-flex items-center px-2.5 py-0.5 rounded-full font-medium border ${GRIEVANCE_STATUS_COLORS[grievance.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}
                            >
                              {GRIEVANCE_STATUS_LABELS[grievance.status] || grievance.status}
                            </span>
                            <span class="flex items-center gap-1">
                              <Clock size={12} />
                              {formatDate(grievance.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                }}
              </For>
            </div>
          </Show>
        </Suspense>
      </div>
    </MainLayout>
  )
}
