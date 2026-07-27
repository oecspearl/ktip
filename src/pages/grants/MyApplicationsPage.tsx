import { Link } from 'react-router'
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
} from 'lucide-react'
import { formatCurrency, formatDate } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function MyApplicationsPage() {
  usePageTitle('My Grant Applications')
  const auth = useAuth()
  const { applications, loading } = useGrantApplications(auth.user?.id)

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
    <>
      {/* Dark Hero */}
      <div className="bg-gray-800 min-h-[180px]">
        <div className="container mx-auto px-4 pt-6 pb-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} className="text-gray-500" />
            <Link to="/grants" className="hover:text-white transition-colors">Grants</Link>
            <ChevronRight size={14} className="text-gray-500" />
            <span className="text-gray-200">My Applications</span>
          </nav>

          <p className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">My Applications</p>
          <h1 className="text-4xl font-display font-bold text-white mb-2">
            Grant Applications
          </h1>
          <p className="text-lg text-gray-400">
            Track the status of your funding applications
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 -mt-4 pb-8">
        {loading || !applications ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
            <p className="mt-4 text-ktip-sand-600">Loading applications...</p>
          </div>
        ) : applications.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <p className="text-sm text-ktip-sand-600">
                {applications.length} application
                {applications.length !== 1 ? 's' : ''} submitted
              </p>
            </div>

            {applications.map((application, index) => (
              <div
                key={application.id}
                className={`px-6 py-5 ${index < applications.length - 1 ? 'border-b border-gray-200' : ''}`}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  {/* Grant Info */}
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-1">
                        <Link
                          to={`/grants/${application.grant.id}`}
                          className="text-2xl font-display font-bold text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                        >
                          {application.grant.title}
                        </Link>
                        {application.grant.grant_type && (
                          <Badge variant="primary" className="mt-2">
                            {application.grant
                              .grant_type!.replace('_', ' ')
                              .toUpperCase()}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Application Data Summary */}
                    <div className="space-y-2 mb-4">
                      {application.application_data.projectTitle && (
                        <div>
                          <span className="text-sm text-ktip-sand-600">
                            Project:{' '}
                          </span>
                          <span className="font-medium text-ktip-sand-900">
                            {application.application_data.projectTitle}
                          </span>
                        </div>
                      )}
                      {application.application_data.fundingAmount && (
                        <div className="flex items-center gap-2">
                          <DollarSign size={16} className="text-ktip-sand-400" />
                          <span className="text-sm text-ktip-sand-600">
                            Requested:{' '}
                          </span>
                          <span className="font-medium text-ktip-sand-900">
                            {formatCurrency(
                              parseFloat(
                                application.application_data.fundingAmount
                              ),
                              application.grant.currency
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-ktip-sand-500">
                      <div className="flex items-center gap-1">
                        <Calendar size={16} />
                        <span>
                          Applied {formatDate(application.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex flex-col items-end gap-2">
                    <div
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${getStatusColor(
                        application.status
                      )}`}
                    >
                      {getStatusIcon(application.status)}
                      <span className="font-medium">
                        {getStatusLabel(application.status)}
                      </span>
                    </div>
                    <Link to={`/grants/${application.grant.id}`}>
                      <Button variant="outline" size="sm">
                        View Grant
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Project Description */}
                {application.application_data.projectDescription && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-sm text-ktip-sand-600 mb-1">
                      Project Description
                    </p>
                    <p className="text-ktip-sand-700 line-clamp-3">
                      {application.application_data.projectDescription}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText size={32} className="text-ktip-sand-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                No applications yet
              </h3>
              <p className="text-ktip-sand-600 mb-6">
                You haven't applied for any grants yet. Browse available
                opportunities and submit your first application.
              </p>
              <Link to="/grants">
                <Button icon={<FileText size={20} />}>Browse Grants</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
