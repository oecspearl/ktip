import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
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
} from 'lucide-react'
import { formatCurrency, formatDate, truncate } from '../../lib/utils'
import { isPast } from 'date-fns'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function GrantDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const { grant, loading: grantLoading } = useGrant(params.id)
  usePageTitle(grant?.title)
  const {
    applyForGrant,
    checkApplication,
    getApplicationCount,
    loading: applicationLoading,
  } = useApplyForGrant()

  const [hasApplied, setHasApplied] = useState(false)
  const [applicationCount, setApplicationCount] = useState(0)
  const [checking, setChecking] = useState(true)
  const [showApplicationModal, setShowApplicationModal] = useState(false)

  // Application form state
  const [projectTitle, setProjectTitle] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [fundingAmount, setFundingAmount] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [timeline, setTimeline] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isExpired = !!(grant && grant.deadline && isPast(new Date(grant.deadline)))
  const canApply = !!(grant && grant.is_active && !isExpired && !hasApplied)

  // Check application status
  useEffect(() => {
    if (grant && auth.user) {
      setChecking(true)
      Promise.all([
        checkApplication(grant.id, auth.user.id),
        getApplicationCount(grant.id),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant?.id, auth.user?.id])

  const handleApply = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})

    if (!projectTitle || !projectDescription) {
      setErrors({
        projectTitle: !projectTitle ? 'Project title is required' : '',
        projectDescription: !projectDescription ? 'Description is required' : '',
      })
      return
    }

    try {
      await applyForGrant({
        grant_id: grant!.id,
        user_id: auth.user!.id,
        application_data: {
          projectTitle,
          projectDescription,
          fundingAmount,
          teamSize,
          timeline,
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
    if (!grant) return ''
    if (grant.amount_min && grant.amount_max) {
      return `${formatCurrency(grant.amount_min, grant.currency)} - ${formatCurrency(grant.amount_max, grant.currency)}`
    } else if (grant.amount_min) {
      return `${formatCurrency(grant.amount_min, grant.currency)}+`
    } else if (grant.amount_max) {
      return `Up to ${formatCurrency(grant.amount_max, grant.currency)}`
    }
    return 'Amount varies'
  }

  if (grantLoading || !grant) {
    if (grantLoading) {
      return (
        <div className="container mx-auto px-4 py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
          <p className="mt-4 text-ktip-sand-600">Loading grant...</p>
        </div>
      )
    }
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">💰</span>
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          Grant Not Found
        </h2>
        <p className="text-gray-500 mb-6">
          This grant doesn't exist or has been removed.
        </p>
        <button
          onClick={() => navigate('/grants')}
          className="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
        >
          Back to Grants
        </button>
      </div>
    )
  }

  return (
    <>
      {/* === Dark Hero Header Band === */}
      <div className="relative min-h-[180px] flex items-center bg-gray-800">
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gray-900/80" />

        <div className="relative container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Grant Detail</p>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                {grant.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {grant.grant_type && (
                  <Badge variant="primary">
                    {grant.grant_type?.replace('_', ' ').toUpperCase()}
                  </Badge>
                )}
                {!grant.is_active && (
                  <Badge variant="default">Inactive</Badge>
                )}
                {isExpired && (
                  <Badge variant="danger">Expired</Badge>
                )}
              </div>
            </div>
            <nav className="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white transition-colors">Home</Link>
              <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
              <Link to="/grants" className="hover:text-white transition-colors">Grants</Link>
              <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
              <span className="text-gray-300">{truncate(grant.title, 30)}</span>
            </nav>
          </div>
        </div>
      </div>

      {/* === Two-Column Content Area === */}
      <div className="bg-white py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
            {/* Status Banner */}
            {isExpired && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle size={20} />
                  <p className="font-medium">This grant has expired</p>
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="flex items-center gap-3 text-ktip-ocean-600 mb-6">
              <DollarSign size={32} />
              <span className="text-3xl font-bold">{getAmountDisplay()}</span>
            </div>

            {/* Key Details */}
            <div className="grid md:grid-cols-2 gap-4 mb-8 p-4 bg-ktip-canvas rounded-xl">
              {grant.deadline && (
                <div className="flex items-start gap-3">
                  <Calendar size={20} className="text-ktip-ocean-600 mt-1" />
                  <div>
                    <p className="text-sm text-ktip-sand-600">Deadline</p>
                    <p
                      className={`font-medium ${
                        isExpired ? 'text-red-600' : 'text-ktip-sand-900'
                      }`}
                    >
                      {formatDate(grant.deadline)}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <FileText size={20} className="text-ktip-ocean-600 mt-1" />
                <div>
                  <p className="text-sm text-ktip-sand-600">Applications</p>
                  <p className="font-medium text-ktip-sand-900">
                    {applicationCount} submitted
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            {grant.description && (
              <div className="mb-8">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  About this Grant
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">Grant overview and details</p>
                <div className="text-gray-700 leading-relaxed text-base whitespace-pre-wrap">
                  {grant.description}
                </div>
              </div>
            )}

            {/* Eligibility */}
            {grant.eligibility && (
              <div className="mb-8">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1 flex items-center gap-2">
                  <Users size={18} />
                  Eligibility Requirements
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">Who can apply</p>
                <div className="text-gray-700 leading-relaxed text-base whitespace-pre-wrap">
                  {grant.eligibility}
                </div>
              </div>
            )}
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            {/* Widget 1: Apply for Grant */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Apply for Grant
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Submit your application</p>

              {checking && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ktip-ocean-500 mx-auto"></div>
                </div>
              )}

              {!checking && (
                <>
                  {hasApplied && (
                    <div className="bg-ktip-tropical-50 border border-ktip-tropical-200 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-2 text-ktip-tropical-700 mb-2">
                        <CheckCircle size={20} />
                        <span className="font-medium">Application Submitted!</span>
                      </div>
                      <p className="text-sm text-ktip-tropical-600">
                        Your application is under review.
                      </p>
                    </div>
                  )}

                  {isExpired && !hasApplied && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-red-700">
                        This grant has expired and is no longer accepting applications.
                      </p>
                    </div>
                  )}

                  {!grant.is_active && !hasApplied && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-gray-700">
                        This grant is currently inactive.
                      </p>
                    </div>
                  )}

                  {grant.application_url && (
                    <Button
                      fullWidth
                      icon={<ExternalLink size={20} />}
                      onClick={() => window.open(grant.application_url!, '_blank')}
                    >
                      Apply on External Site
                    </Button>
                  )}

                  {!grant.application_url && canApply && (
                    <Button
                      fullWidth
                      onClick={() => setShowApplicationModal(true)}
                      icon={<FileText size={20} />}
                    >
                      Apply Now
                    </Button>
                  )}
                </>
              )}

              <div className="mt-4 pt-4 border-t border-ktip-sand-100">
                <p className="text-sm text-ktip-sand-600">
                  {applicationCount} {applicationCount === 1 ? 'application' : 'applications'}{' '}
                  submitted
                </p>
              </div>
            </div>

            {/* Widget 2: Grant Information */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Grant Information
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Key details</p>
              <div className="text-sm divide-y divide-gray-100">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Currency</span>
                  <span className="font-medium text-ktip-sand-900">
                    {grant.currency}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Status</span>
                  <span className="font-medium text-ktip-sand-900">
                    {grant.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Posted</span>
                  <span className="font-medium text-ktip-sand-900">
                    {formatDate(grant.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Application Modal */}
      <Modal
        open={showApplicationModal}
        onClose={() => setShowApplicationModal(false)}
        title="Apply for Grant"
        description="Submit your application for this funding opportunity"
        size="lg"
      >
        <form onSubmit={handleApply} className="space-y-4">
          <Input
            label="Project Title"
            placeholder="Your project name"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.currentTarget.value)}
            error={errors.projectTitle}
            fullWidth
            required
          />

          <Textarea
            label="Project Description"
            placeholder="Describe your project and how you'll use the funding..."
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.currentTarget.value)}
            error={errors.projectDescription}
            rows={5}
            fullWidth
            required
          />

          <Input
            label="Funding Amount Requested"
            type="number"
            placeholder="Amount in USD"
            value={fundingAmount}
            onChange={(e) => setFundingAmount(e.currentTarget.value)}
            fullWidth
          />

          <Input
            label="Team Size"
            type="number"
            placeholder="Number of team members"
            value={teamSize}
            onChange={(e) => setTeamSize(e.currentTarget.value)}
            fullWidth
          />

          <Input
            label="Project Timeline"
            placeholder="e.g., 6 months, 1 year"
            value={timeline}
            onChange={(e) => setTimeline(e.currentTarget.value)}
            fullWidth
          />

          <div className="flex gap-3 mt-6">
            <Button type="submit" loading={applicationLoading} fullWidth>
              Submit Application
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowApplicationModal(false)}
              disabled={applicationLoading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
