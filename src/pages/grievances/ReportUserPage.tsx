import { createSignal, Show, Suspense } from 'solid-js'
import { useParams, useNavigate, A } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
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
import { getInitials, generateAvatarColor } from '../../lib/utils'
import { ChevronRight, Flag, AlertTriangle, User, ShieldAlert } from 'lucide-solid'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function ReportUserPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  const { profile: reportedUser } = useProfile(() => params.userId)
  const { createGrievance, loading } = useCreateGrievance()

  usePageTitle(() => 'Report User')

  const [category, setCategory] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [evidenceUrl, setEvidenceUrl] = createSignal('')
  const [context, setContext] = createSignal('')
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [showConfirmModal, setShowConfirmModal] = createSignal(false)
  const [confirmed, setConfirmed] = createSignal(false)

  const validateForm = (): boolean => {
    const fieldErrors: Record<string, string> = {}

    if (!category()) {
      fieldErrors.category = 'Please select a category'
    }

    if (!description() || description().length < 20) {
      fieldErrors.description = 'Description must be at least 20 characters'
    } else if (description().length > 5000) {
      fieldErrors.description = 'Description too long'
    }

    if (evidenceUrl() && !/^https?:\/\/.+/.test(evidenceUrl())) {
      fieldErrors.evidence_url = 'Please enter a valid URL'
    }

    if (context() && context().length > 1000) {
      fieldErrors.context = 'Context too long (max 1000 characters)'
    }

    setErrors(fieldErrors)
    return Object.keys(fieldErrors).length === 0
  }

  const handleSubmitClick = (e: Event) => {
    e.preventDefault()
    if (!validateForm()) return
    setShowConfirmModal(true)
  }

  const handleConfirmedSubmit = async () => {
    setShowConfirmModal(false)
    setConfirmed(false)

    try {
      await createGrievance({
        reporter_id: auth.user()!.id,
        reported_user_id: params.userId as string,
        category: category(),
        description: description(),
        evidence_url: evidenceUrl() || undefined,
        context: context() || undefined,
      })
      toast.success('Report submitted successfully. Our team will review it shortly.')
      navigate('/grievances/my-reports')
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit report')
    }
  }

  const displayName = () => reportedUser()?.display_name || 'Unknown User'

  return (
    <MainLayout>
      <Suspense fallback={<div class="bg-gray-800 min-h-[120px] animate-pulse-soft" />}>
        {/* Dark Hero */}
        <div class="bg-gray-800">
          <div class="container mx-auto px-4 py-6">
            <nav class="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
              <A href="/" class="hover:text-white transition-colors">Home</A>
              <ChevronRight size={14} class="text-gray-500" />
              <span class="text-gray-200">Report User</span>
            </nav>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Flag size={20} class="text-red-400" />
              </div>
              <div>
                <h1 class="text-2xl font-display font-bold text-white">Report a User</h1>
                <p class="text-gray-400 text-sm">Submit a report about inappropriate behavior or policy violations</p>
              </div>
            </div>
          </div>
        </div>

        <div class="container mx-auto px-4 py-8 max-w-2xl">
          {/* Warning Banner */}
          <div class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
            <AlertTriangle size={20} class="text-amber-600 shrink-0 mt-0.5" />
            <div class="text-sm text-amber-800">
              <p class="font-medium mb-1">Please use this feature responsibly</p>
              <p>False or malicious reports may result in action against your account. All reports are reviewed by our administration team.</p>
            </div>
          </div>

          {/* Reported User Card */}
          <Show when={reportedUser()}>
            <div class="flex items-center gap-4 p-4 bg-ktip-sand-50 border border-ktip-sand-200 rounded-xl mb-6">
              <div
                class={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0 ${generateAvatarColor(displayName())}`}
              >
                {getInitials(displayName())}
              </div>
              <div>
                <p class="text-sm text-ktip-sand-500">Reporting user</p>
                <p class="font-semibold text-ktip-sand-900">{displayName()}</p>
              </div>
            </div>
          </Show>

          <Show when={!reportedUser() && !reportedUser.loading}>
            <div class="text-center py-12">
              <div class="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <User size={32} class="text-ktip-sand-400" />
              </div>
              <h2 class="text-xl font-display font-bold text-ktip-sand-900 mb-2">User not found</h2>
              <p class="text-ktip-sand-600 mb-6">This user doesn't exist or their profile is unavailable.</p>
              <Button onClick={() => navigate('/')}>Back to Home</Button>
            </div>
          </Show>

          {/* Report Form */}
          <Show when={reportedUser()}>
            <Card>
              <form onSubmit={handleSubmitClick} class="space-y-6">
                {/* Category */}
                <div>
                  <label class="block text-sm font-medium text-ktip-sand-700 mb-2">
                    Category of Infringement <span class="text-red-500">*</span>
                  </label>
                  <select
                    value={category()}
                    onChange={(e) => setCategory(e.currentTarget.value)}
                    class="w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 focus:bg-white focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 transition-all text-ktip-sand-900"
                  >
                    <option value="">Select a category...</option>
                    {Object.entries(GRIEVANCE_CATEGORY_LABELS).map(([value, label]) => (
                      <option value={value}>{label}</option>
                    ))}
                  </select>
                  <Show when={errors().category}>
                    <p class="text-sm text-red-500 mt-1">{errors().category}</p>
                  </Show>
                </div>

                {/* Description */}
                <Textarea
                  label="Description *"
                  placeholder="Please describe the incident in detail. Include what happened, when it occurred, and any relevant context that can help our team investigate..."
                  value={description()}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                  error={errors().description}
                  helperText={`${description().length}/5000 characters (minimum 20)`}
                  rows={6}
                  fullWidth
                />

                {/* Evidence URL */}
                <Input
                  label="Evidence URL (optional)"
                  placeholder="https://example.com/screenshot-or-link"
                  value={evidenceUrl()}
                  onInput={(e) => setEvidenceUrl(e.currentTarget.value)}
                  error={errors().evidence_url}
                  helperText="Link to a screenshot, post, or other evidence supporting your report"
                  fullWidth
                />

                {/* Context */}
                <Input
                  label="Where did this happen? (optional)"
                  placeholder="e.g., In a forum post, during a message exchange, on a project page..."
                  value={context()}
                  onInput={(e) => setContext(e.currentTarget.value)}
                  error={errors().context}
                  helperText="Help us locate the incident by describing where it occurred on the platform"
                  fullWidth
                />

                {/* Actions */}
                <div class="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
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
                    loading={loading()}
                    icon={<Flag size={18} />}
                  >
                    Submit Report
                  </Button>
                </div>
              </form>
            </Card>
          </Show>
        </div>
      </Suspense>

      {/* Confirmation Modal */}
      <Modal
        open={showConfirmModal()}
        onClose={() => { setShowConfirmModal(false); setConfirmed(false) }}
        title="Confirm Your Report"
        size="md"
      >
        <div class="space-y-5">
          <div class="flex items-center justify-center">
            <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert size={32} class="text-red-600" />
            </div>
          </div>

          <div class="text-center">
            <h3 class="text-lg font-semibold text-ktip-sand-900 mb-2">
              Are you sure you want to submit this report?
            </h3>
            <p class="text-sm text-ktip-sand-600">
              You are reporting <span class="font-semibold text-ktip-sand-900">{displayName()}</span> for{' '}
              <span class="font-semibold text-ktip-sand-900">{GRIEVANCE_CATEGORY_LABELS[category()] || category()}</span>.
            </p>
          </div>

          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div class="flex items-start gap-3">
              <AlertTriangle size={18} class="text-amber-600 shrink-0 mt-0.5" />
              <div class="text-sm text-amber-800 space-y-2">
                <p class="font-semibold">By submitting this report, you confirm that:</p>
                <ul class="list-disc pl-4 space-y-1">
                  <li>The information provided is truthful and accurate to the best of your knowledge.</li>
                  <li>You understand that filing false or misleading reports is a violation of platform policy.</li>
                  <li>Submitting false reports may result in disciplinary action against your own account, including suspension or termination.</li>
                  <li>This report will be reviewed by the KTIP administration team and may be used in any resulting investigation.</li>
                </ul>
              </div>
            </div>
          </div>

          <label class="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-ktip-sand-200 hover:bg-ktip-sand-50 transition-colors">
            <input
              type="checkbox"
              checked={confirmed()}
              onChange={(e) => setConfirmed(e.currentTarget.checked)}
              class="mt-0.5 w-4 h-4 rounded border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
            />
            <span class="text-sm text-ktip-sand-700">
              I confirm that this report is made in good faith and the information provided is accurate.
            </span>
          </label>

          <div class="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => { setShowConfirmModal(false); setConfirmed(false) }}
            >
              Go Back
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmedSubmit}
              loading={loading()}
              disabled={!confirmed()}
              icon={<Flag size={18} />}
            >
              Confirm & Submit
            </Button>
          </div>
        </div>
      </Modal>
    </MainLayout>
  )
}
