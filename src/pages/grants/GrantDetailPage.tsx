import { Show, Suspense, createSignal, createEffect } from 'solid-js'
import { useParams, useNavigate, A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { useGrant, useApplyForGrant } from '../../hooks/useGrants'
import { useAuth } from '../../contexts/AuthContext'
import {
  DollarSign,
  Calendar,
  Users,
  FileText,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-solid'
import { formatCurrency, formatDate, truncate } from '../../lib/utils'
import { isPast } from 'date-fns'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function GrantDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const { grant } = useGrant(() => params.id)
  usePageTitle(() => grant()?.title)
  const {
    applyForGrant,
    checkApplication,
    getApplicationCount,
    loading: applicationLoading,
  } = useApplyForGrant()

  const [hasApplied, setHasApplied] = createSignal(false)
  const [applicationCount, setApplicationCount] = createSignal(0)
  const [checking, setChecking] = createSignal(true)
  const [showApplicationModal, setShowApplicationModal] = createSignal(false)

  // Application form state
  const [projectTitle, setProjectTitle] = createSignal('')
  const [projectDescription, setProjectDescription] = createSignal('')
  const [fundingAmount, setFundingAmount] = createSignal('')
  const [teamSize, setTeamSize] = createSignal('')
  const [timeline, setTimeline] = createSignal('')
  const [errors, setErrors] = createSignal<Record<string, string>>({})

  const isExpired = () =>
    grant() && grant()!.deadline && isPast(new Date(grant()!.deadline!))
  const canApply = () =>
    grant() && grant()!.is_active && !isExpired() && !hasApplied()

  // Check application status
  createEffect(() => {
    const grantData = grant()
    const userData = auth.user()
    if (grantData && userData) {
      setChecking(true)
      Promise.all([
        checkApplication(grantData.id, userData.id),
        getApplicationCount(grantData.id),
      ])
        .then(([hasApp, count]) => {
          setHasApplied(hasApp)
          setApplicationCount(count)
        })
        .catch((error) => {
          console.error('Error checking application:', error)
        })
        .finally(() => {
          setChecking(false)
        })
    }
  })

  const handleApply = async (e: Event) => {
    e.preventDefault()
    setErrors({})

    if (!projectTitle() || !projectDescription()) {
      setErrors({
        projectTitle: !projectTitle() ? 'Project title is required' : '',
        projectDescription: !projectDescription() ? 'Description is required' : '',
      })
      return
    }

    try {
      await applyForGrant({
        grant_id: grant()!.id,
        user_id: auth.user()!.id,
        application_data: {
          projectTitle: projectTitle(),
          projectDescription: projectDescription(),
          fundingAmount: fundingAmount(),
          teamSize: teamSize(),
          timeline: timeline(),
        },
      })

      setHasApplied(true)
      setApplicationCount((c) => c + 1)
      setShowApplicationModal(false)

      // Reset form
      setProjectTitle('')
      setProjectDescription('')
      setFundingAmount('')
      setTeamSize('')
      setTimeline('')
    } catch (error: any) {
      console.error('Application error:', error)
    }
  }

  const getAmountDisplay = () => {
    if (!grant()) return ''
    const g = grant()!
    if (g.amount_min && g.amount_max) {
      return `${formatCurrency(g.amount_min, g.currency)} - ${formatCurrency(g.amount_max, g.currency)}`
    } else if (g.amount_min) {
      return `${formatCurrency(g.amount_min, g.currency)}+`
    } else if (g.amount_max) {
      return `Up to ${formatCurrency(g.amount_max, g.currency)}`
    }
    return 'Amount varies'
  }

  return (
    <MainLayout>
      <Suspense
        fallback={
          <div class="container mx-auto px-4 py-12 text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
            <p class="mt-4 text-ktip-sand-600">Loading grant...</p>
          </div>
        }
      >
        <Show
          when={!grant.loading && grant()}
          fallback={
            <div class="container mx-auto px-4 py-16 text-center">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span class="text-3xl">💰</span>
              </div>
              <h2 class="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
                Grant Not Found
              </h2>
              <p class="text-gray-500 mb-6">
                This grant doesn't exist or has been removed.
              </p>
              <button
                onClick={() => navigate('/grants')}
                class="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
              >
                Back to Grants
              </button>
            </div>
          }
        >
          {/* === Dark Hero Header Band === */}
          <div class="relative min-h-[180px] flex items-center bg-gray-800">
            {/* Dark overlay */}
            <div class="absolute inset-0 bg-gray-900/80" />

            <div class="relative container mx-auto px-4 py-10">
              <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Grant Detail</p>
                  <h1 class="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                    {grant()!.title}
                  </h1>
                  <div class="flex flex-wrap items-center gap-2">
                    <Show when={grant()!.grant_type}>
                      <Badge variant="primary">
                        {grant()!.grant_type?.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </Show>
                    <Show when={!grant()!.is_active}>
                      <Badge variant="default">Inactive</Badge>
                    </Show>
                    <Show when={isExpired()}>
                      <Badge variant="danger">Expired</Badge>
                    </Show>
                  </div>
                </div>
                <nav class="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                  <A href="/" class="hover:text-white transition-colors">Home</A>
                  <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                  <A href="/grants" class="hover:text-white transition-colors">Grants</A>
                  <span class="mx-1.5"><ChevronRight size={12} class="inline" /></span>
                  <span class="text-gray-300">{truncate(grant()!.title, 30)}</span>
                </nav>
              </div>
            </div>
          </div>

          {/* === Two-Column Content Area === */}
          <div class="bg-white py-12">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">

              {/* === Main Column === */}
              <div class="lg:col-span-2">
                {/* Status Banner */}
                <Show when={isExpired()}>
                  <div class="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                    <div class="flex items-center gap-2 text-red-700">
                      <AlertCircle size={20} />
                      <p class="font-medium">This grant has expired</p>
                    </div>
                  </div>
                </Show>

                {/* Amount */}
                <div class="flex items-center gap-3 text-ktip-ocean-600 mb-6">
                  <DollarSign size={32} />
                  <span class="text-3xl font-bold">{getAmountDisplay()}</span>
                </div>

                {/* Key Details */}
                <div class="grid md:grid-cols-2 gap-4 mb-8 p-4 bg-ktip-canvas rounded-xl">
                  <Show when={grant()!.deadline}>
                    <div class="flex items-start gap-3">
                      <Calendar size={20} class="text-ktip-ocean-600 mt-1" />
                      <div>
                        <p class="text-sm text-ktip-sand-600">Deadline</p>
                        <p
                          class={`font-medium ${
                            isExpired() ? 'text-red-600' : 'text-ktip-sand-900'
                          }`}
                        >
                          {formatDate(grant()!.deadline!)}
                        </p>
                      </div>
                    </div>
                  </Show>

                  <div class="flex items-start gap-3">
                    <FileText size={20} class="text-ktip-ocean-600 mt-1" />
                    <div>
                      <p class="text-sm text-ktip-sand-600">Applications</p>
                      <p class="font-medium text-ktip-sand-900">
                        {applicationCount()} submitted
                      </p>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <Show when={grant()!.description}>
                  <div class="mb-8">
                    <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                      About this Grant
                    </h3>
                    <p class="text-ktip-ocean-600 text-xs italic mb-4">Grant overview and details</p>
                    <div class="text-gray-700 leading-relaxed text-base whitespace-pre-wrap">
                      {grant()!.description}
                    </div>
                  </div>
                </Show>

                {/* Eligibility */}
                <Show when={grant()!.eligibility}>
                  <div class="mb-8">
                    <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1 flex items-center gap-2">
                      <Users size={18} />
                      Eligibility Requirements
                    </h3>
                    <p class="text-ktip-ocean-600 text-xs italic mb-4">Who can apply</p>
                    <div class="text-gray-700 leading-relaxed text-base whitespace-pre-wrap">
                      {grant()!.eligibility}
                    </div>
                  </div>
                </Show>
              </div>

              {/* === Sidebar === */}
              <div class="lg:col-span-1">
                {/* Widget 1: Apply for Grant */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                    Apply for Grant
                  </h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Submit your application</p>

                  <Show when={checking()}>
                    <div class="text-center py-4">
                      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-ktip-ocean-500 mx-auto"></div>
                    </div>
                  </Show>

                  <Show when={!checking()}>
                    <Show when={hasApplied()}>
                      <div class="bg-ktip-tropical-50 border border-ktip-tropical-200 rounded-xl p-4 mb-4">
                        <div class="flex items-center gap-2 text-ktip-tropical-700 mb-2">
                          <CheckCircle size={20} />
                          <span class="font-medium">Application Submitted!</span>
                        </div>
                        <p class="text-sm text-ktip-tropical-600">
                          Your application is under review.
                        </p>
                      </div>
                    </Show>

                    <Show when={isExpired() && !hasApplied()}>
                      <div class="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                        <p class="text-sm text-red-700">
                          This grant has expired and is no longer accepting applications.
                        </p>
                      </div>
                    </Show>

                    <Show when={!grant()!.is_active && !hasApplied()}>
                      <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
                        <p class="text-sm text-gray-700">
                          This grant is currently inactive.
                        </p>
                      </div>
                    </Show>

                    <Show when={grant()!.application_url}>
                      <Button
                        fullWidth
                        icon={<ExternalLink size={20} />}
                        onClick={() => window.open(grant()!.application_url!, '_blank')}
                      >
                        Apply on External Site
                      </Button>
                    </Show>

                    <Show when={!grant()!.application_url && canApply()}>
                      <Button
                        fullWidth
                        onClick={() => setShowApplicationModal(true)}
                        icon={<FileText size={20} />}
                      >
                        Apply Now
                      </Button>
                    </Show>
                  </Show>

                  <div class="mt-4 pt-4 border-t border-ktip-sand-100">
                    <p class="text-sm text-ktip-sand-600">
                      {applicationCount()} {applicationCount() === 1 ? 'application' : 'applications'}{' '}
                      submitted
                    </p>
                  </div>
                </div>

                {/* Widget 2: Grant Information */}
                <div class="mb-10">
                  <h3 class="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                    Grant Information
                  </h3>
                  <p class="text-ktip-ocean-600 text-xs italic mb-4">Key details</p>
                  <div class="text-sm divide-y divide-gray-100">
                    <div class="flex items-center justify-between py-2.5">
                      <span class="text-gray-500">Currency</span>
                      <span class="font-medium text-ktip-sand-900">
                        {grant()!.currency}
                      </span>
                    </div>
                    <div class="flex items-center justify-between py-2.5">
                      <span class="text-gray-500">Status</span>
                      <span class="font-medium text-ktip-sand-900">
                        {grant()!.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div class="flex items-center justify-between py-2.5">
                      <span class="text-gray-500">Posted</span>
                      <span class="font-medium text-ktip-sand-900">
                        {formatDate(grant()!.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Application Modal */}
          <Modal
            open={showApplicationModal()}
            onClose={() => setShowApplicationModal(false)}
            title="Apply for Grant"
            description="Submit your application for this funding opportunity"
            size="lg"
          >
            <form onSubmit={handleApply} class="space-y-4">
              <Input
                label="Project Title"
                placeholder="Your project name"
                value={projectTitle()}
                onInput={(e) => setProjectTitle(e.currentTarget.value)}
                error={errors().projectTitle}
                fullWidth
                required
              />

              <Textarea
                label="Project Description"
                placeholder="Describe your project and how you'll use the funding..."
                value={projectDescription()}
                onInput={(e) => setProjectDescription(e.currentTarget.value)}
                error={errors().projectDescription}
                rows={5}
                fullWidth
                required
              />

              <Input
                label="Funding Amount Requested"
                type="number"
                placeholder="Amount in USD"
                value={fundingAmount()}
                onInput={(e) => setFundingAmount(e.currentTarget.value)}
                fullWidth
              />

              <Input
                label="Team Size"
                type="number"
                placeholder="Number of team members"
                value={teamSize()}
                onInput={(e) => setTeamSize(e.currentTarget.value)}
                fullWidth
              />

              <Input
                label="Project Timeline"
                placeholder="e.g., 6 months, 1 year"
                value={timeline()}
                onInput={(e) => setTimeline(e.currentTarget.value)}
                fullWidth
              />

              <div class="flex gap-3 mt-6">
                <Button type="submit" loading={applicationLoading()} fullWidth>
                  Submit Application
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowApplicationModal(false)}
                  disabled={applicationLoading()}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Modal>
        </Show>
      </Suspense>
    </MainLayout>
  )
}
