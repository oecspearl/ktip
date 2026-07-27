import { Show, For, Suspense } from 'solid-js'
import { A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useGrantApplications } from '../../hooks/useGrants'
import { useAuth } from '../../contexts/AuthContext'
import {
  ChevronRight,
  FileText,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-solid'
import { formatCurrency, formatDate } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function MyApplicationsPage() {
  usePageTitle(() => 'My Grant Applications')
  const auth = useAuth()
  const { applications } = useGrantApplications(() => auth.user()?.id)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200'
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200'
      case 'under_review':
        return 'bg-blue-100 text-blue-700 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={20} />
      case 'rejected':
        return <XCircle size={20} />
      case 'under_review':
        return <Clock size={20} />
      default:
        return <AlertCircle size={20} />
    }
  }

  const getStatusLabel = (status: string) => {
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return (
    <MainLayout>
      {/* Dark Hero */}
      <div class="bg-gray-800 min-h-[180px]">
        <div class="container mx-auto px-4 pt-6 pb-10">
          {/* Breadcrumb */}
          <nav class="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
            <A href="/" class="hover:text-white transition-colors">Home</A>
            <ChevronRight size={14} class="text-gray-500" />
            <A href="/grants" class="hover:text-white transition-colors">Grants</A>
            <ChevronRight size={14} class="text-gray-500" />
            <span class="text-gray-200">My Applications</span>
          </nav>

          <p class="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">My Applications</p>
          <h1 class="text-4xl font-display font-bold text-white mb-2">
            Grant Applications
          </h1>
          <p class="text-lg text-gray-400">
            Track the status of your funding applications
          </p>
        </div>
      </div>

      {/* Content */}
      <div class="container mx-auto px-4 -mt-4 pb-8">
        <Suspense
          fallback={
            <div class="text-center py-12">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
              <p class="mt-4 text-ktip-sand-600">Loading applications...</p>
            </div>
          }
        >
          <Show
            when={!applications.loading && applications()}
            fallback={
              <div class="text-center py-12">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
                <p class="mt-4 text-ktip-sand-600">Loading applications...</p>
              </div>
            }
          >
            <Show
              when={applications()!.length > 0}
              fallback={
                <div class="bg-white border border-gray-200 rounded-lg p-6">
                  <div class="text-center py-12">
                    <div class="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText size={32} class="text-ktip-sand-400" />
                    </div>
                    <h3 class="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                      No applications yet
                    </h3>
                    <p class="text-ktip-sand-600 mb-6">
                      You haven't applied for any grants yet. Browse available
                      opportunities and submit your first application.
                    </p>
                    <A href="/grants">
                      <Button icon={<FileText size={20} />}>Browse Grants</Button>
                    </A>
                  </div>
                </div>
              }
            >
              <div class="bg-white border border-gray-200 rounded-lg">
                <div class="px-6 py-4 border-b border-gray-200">
                  <p class="text-sm text-ktip-sand-600">
                    {applications()!.length} application
                    {applications()!.length !== 1 ? 's' : ''} submitted
                  </p>
                </div>

                <For each={applications()}>
                  {(application, index) => (
                    <div class={`px-6 py-5 ${index() < applications()!.length - 1 ? 'border-b border-gray-200' : ''}`}>
                      <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        {/* Grant Info */}
                        <div class="flex-1">
                          <div class="flex items-start gap-3 mb-3">
                            <div class="flex-1">
                              <A
                                href={`/grants/${application.grant.id}`}
                                class="text-2xl font-display font-bold text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                              >
                                {application.grant.title}
                              </A>
                              <Show when={application.grant.grant_type}>
                                <Badge variant="primary" class="mt-2">
                                  {application.grant
                                    .grant_type!.replace('_', ' ')
                                    .toUpperCase()}
                                </Badge>
                              </Show>
                            </div>
                          </div>

                          {/* Application Data Summary */}
                          <div class="space-y-2 mb-4">
                            <Show when={application.application_data.projectTitle}>
                              <div>
                                <span class="text-sm text-ktip-sand-600">
                                  Project:{' '}
                                </span>
                                <span class="font-medium text-ktip-sand-900">
                                  {application.application_data.projectTitle}
                                </span>
                              </div>
                            </Show>
                            <Show when={application.application_data.fundingAmount}>
                              <div class="flex items-center gap-2">
                                <DollarSign size={16} class="text-ktip-sand-400" />
                                <span class="text-sm text-ktip-sand-600">
                                  Requested:{' '}
                                </span>
                                <span class="font-medium text-ktip-sand-900">
                                  {formatCurrency(
                                    parseFloat(
                                      application.application_data.fundingAmount
                                    ),
                                    application.grant.currency
                                  )}
                                </span>
                              </div>
                            </Show>
                          </div>

                          {/* Metadata */}
                          <div class="flex flex-wrap items-center gap-4 text-sm text-ktip-sand-500">
                            <div class="flex items-center gap-1">
                              <Calendar size={16} />
                              <span>
                                Applied {formatDate(application.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div class="flex flex-col items-end gap-2">
                          <div
                            class={`flex items-center gap-2 px-4 py-2 rounded-lg border ${getStatusColor(
                              application.status
                            )}`}
                          >
                            {getStatusIcon(application.status)}
                            <span class="font-medium">
                              {getStatusLabel(application.status)}
                            </span>
                          </div>
                          <A href={`/grants/${application.grant.id}`}>
                            <Button variant="outline" size="sm">
                              View Grant
                            </Button>
                          </A>
                        </div>
                      </div>

                      {/* Project Description */}
                      <Show when={application.application_data.projectDescription}>
                        <div class="mt-4 pt-4 border-t border-gray-100">
                          <p class="text-sm text-ktip-sand-600 mb-1">
                            Project Description
                          </p>
                          <p class="text-ktip-sand-700 line-clamp-3">
                            {application.application_data.projectDescription}
                          </p>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Suspense>
      </div>
    </MainLayout>
  )
}
