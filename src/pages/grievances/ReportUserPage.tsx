import { useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Textarea'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { useProfile } from '../../hooks/useProfile'
import { useCreateGrievance } from '../../hooks/useGrievances'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { GRIEVANCE_CATEGORY_LABELS } from '../../lib/constants'
import { Flag, AlertTriangle, User, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'
import { DiamondAvatar } from '../../components/ui/DiamondAvatar'

export default function ReportUserPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  const { profile: reportedUser, loading: reportedUserLoading } = useProfile(params.userId)
  const { createGrievance, loading } = useCreateGrievance()

  usePageTitle('Report User')

  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [context, setContext] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const validateForm = (): boolean => {
    const fieldErrors: Record<string, string> = {}

    if (!category) {
      fieldErrors.category = 'Please select a category'
    }

    if (!description || description.length < 20) {
      fieldErrors.description = 'Description must be at least 20 characters'
    } else if (description.length > 5000) {
      fieldErrors.description = 'Description too long'
    }

    if (evidenceUrl && !/^https?:\/\/.+/.test(evidenceUrl)) {
      fieldErrors.evidence_url = 'Please enter a valid URL'
    }

    if (context && context.length > 1000) {
      fieldErrors.context = 'Context too long (max 1000 characters)'
    }

    setErrors(fieldErrors)
    return Object.keys(fieldErrors).length === 0
  }

  const handleSubmitClick = (e: FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setShowConfirmModal(true)
  }

  const handleConfirmedSubmit = async () => {
    setShowConfirmModal(false)
    setConfirmed(false)

    try {
      await createGrievance({
        reporter_id: auth.user!.id,
        reported_user_id: params.userId as string,
        category,
        description,
        evidence_url: evidenceUrl || undefined,
        context: context || undefined,
      })
      toast.success('Report submitted successfully. Our team will review it shortly.')
      setSubmitted(true)
      navigate('/grievances/my-reports')
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit report')
    }
  }

  const displayName = reportedUser?.display_name || 'Unknown User'

  return (
    <>
      <PageHero
        eyebrow="Community Safety"
        title="Report a User"
        subtitle="Submit a report about inappropriate behavior or policy violations"
        imageSeed="grievances"
        compact
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Report User' }]}
      />

      <div className="w-full max-w-page mx-auto px-4 py-8">
        {/* Submitted confirmation — visible fallback in case redirect is delayed/blocked */}
        {submitted && (
          <div className="flex items-start gap-3 p-4 bg-ktip-tropical-50 border border-ktip-tropical-200 rounded-xl mb-6">
            <CheckCircle2 size={20} className="text-ktip-tropical-700 shrink-0 mt-0.5" />
            <div className="text-sm text-ktip-tropical-900">
              <p className="font-medium mb-1">Report submitted</p>
              <p>
                Redirecting you to{' '}
                <Link to="/grievances/my-reports" className="underline font-medium">
                  My Reports
                </Link>
                . Click the link if you are not redirected automatically.
              </p>
            </div>
          </div>
        )}

        {/* Warning Banner */}
        <div className="flex items-start gap-3 p-4 bg-ktip-sun-50 border border-ktip-sun-200 rounded-xl mb-6">
          <AlertTriangle size={20} className="text-ktip-sun-600 shrink-0 mt-0.5" />
          <div className="text-sm text-ktip-sun-800">
            <p className="font-medium mb-1">Please use this feature responsibly</p>
            <p>False or malicious reports may result in action against your account. All reports are reviewed by our administration team.</p>
          </div>
        </div>

        {/* Reported User Card */}
        {reportedUser && (
          <div className="flex items-center gap-4 p-4 bg-ktip-sand-50 border border-ktip-sand-200 rounded-xl mb-6">
            <DiamondAvatar name={displayName} size={48} />
            <div>
              <p className="text-sm text-ktip-sand-500">Reporting user</p>
              <p className="font-semibold text-ktip-sand-900">{displayName}</p>
            </div>
          </div>
        )}

        {!reportedUser && !reportedUserLoading && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User size={32} className="text-ktip-sand-400" />
            </div>
            <h2 className="text-xl font-display font-bold text-ktip-sand-900 mb-2">User not found</h2>
            <p className="text-ktip-sand-600 mb-6">This user doesn't exist or their profile is unavailable.</p>
            <Button onClick={() => navigate('/')}>Back to Home</Button>
          </div>
        )}

        {/* Report Form */}
        {reportedUser && (
          <Card>
            <form data-tutorial="report-form" onSubmit={handleSubmitClick} className="space-y-6">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
                  Category of Infringement <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 focus:bg-ktip-cream focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 transition-all text-ktip-sand-900"
                >
                  <option value="">Select a category...</option>
                  {Object.entries(GRIEVANCE_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {errors.category && (
                  <p className="text-sm text-red-500 mt-1">{errors.category}</p>
                )}
              </div>

              {/* Description */}
              <Textarea
                label="Description *"
                placeholder="Please describe the incident in detail. Include what happened, when it occurred, and any relevant context that can help our team investigate..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                error={errors.description}
                helperText={`${description.length}/5000 characters (minimum 20)`}
                rows={6}
                fullWidth
              />

              {/* Evidence URL */}
              <Input
                label="Evidence URL (optional)"
                placeholder="https://example.com/screenshot-or-link"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                error={errors.evidence_url}
                helperText="Link to a screenshot, post, or other evidence supporting your report"
                fullWidth
              />

              {/* Context */}
              <Input
                label="Where did this happen? (optional)"
                placeholder="e.g., In a forum post, during a message exchange, on a project page..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                error={errors.context}
                helperText="Help us locate the incident by describing where it occurred on the platform"
                fullWidth
              />

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => navigate(-1)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  type="submit"
                  loading={loading}
                  icon={<Flag size={18} />}
                >
                  Submit Report
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>

      {/* Confirmation Modal */}
      <Modal
        open={showConfirmModal}
        onClose={() => { setShowConfirmModal(false); setConfirmed(false) }}
        title="Confirm Your Report"
        size="md"
      >
        <div className="space-y-5">
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert size={32} className="text-red-600" />
            </div>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-2">
              Are you sure you want to submit this report?
            </h3>
            <p className="text-sm text-ktip-sand-600">
              You are reporting <span className="font-semibold text-ktip-sand-900">{displayName}</span> for{' '}
              <span className="font-semibold text-ktip-sand-900">{GRIEVANCE_CATEGORY_LABELS[category] || category}</span>.
            </p>
          </div>

          <div className="bg-ktip-sun-50 border border-ktip-sun-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-ktip-sun-600 shrink-0 mt-0.5" />
              <div className="text-sm text-ktip-sun-800 space-y-2">
                <p className="font-semibold">By submitting this report, you confirm that:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>The information provided is truthful and accurate to the best of your knowledge.</li>
                  <li>You understand that filing false or misleading reports is a violation of platform policy.</li>
                  <li>Submitting false reports may result in disciplinary action against your own account, including suspension or termination.</li>
                  <li>This report will be reviewed by the KTIP administration team and may be used in any resulting investigation.</li>
                </ul>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-ktip-sand-200 hover:bg-ktip-sand-50 transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
            />
            <span className="text-sm text-ktip-sand-700">
              I confirm that this report is made in good faith and the information provided is accurate.
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => { setShowConfirmModal(false); setConfirmed(false) }}
            >
              Go Back
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmedSubmit}
              loading={loading}
              disabled={!confirmed}
              icon={<Flag size={18} />}
            >
              Confirm & Submit
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
