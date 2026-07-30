import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Stepper } from '../../components/grants/application/Stepper'
import { StepForm } from '../../components/grants/application/StepForm'
import { ApplicationPreview } from '../../components/grants/application/ApplicationPreview'
import { AIReviewPanel } from '../../components/grants/application/AIReviewPanel'
import { SaveStatusBadge } from '../../components/grants/application/SaveStatusBadge'
import { useGrant, useApplyForGrant, useDraftApplication } from '../../hooks/useGrants'
import { fetchReceiptBySource } from '../../hooks/useSubmissionReceipts'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useAutoSave } from '../../hooks/useAutoSave'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'
import { grantImageFor } from '../../lib/hero-images'
import { SponsorNominationCard } from '../../components/grants/SponsorNominationCard'
import { GRANT_APPLICATION_STEPS } from '../../lib/grant-application-template'
import { truncate } from '../../lib/utils'
import {
  ArrowLeft,
  ArrowRight,
  Save,
  CheckCircle,
  Loader2,
} from 'lucide-react'

export default function GrantApplicationPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  const { grant, loading: grantLoading } = useGrant(params.id)
  usePageTitle(grant ? `Apply — ${grant.title}` : 'Apply for Grant')

  const { application: existingApplication, loading: applicationLoading } = useDraftApplication(
    params.id,
    auth.user?.id
  )
  const { saveDraft, submitApplication, loading: saving } = useApplyForGrant()

  const [currentStep, setCurrentStep] = useState(0)
  const [applicationData, setApplicationData] = useState<Record<string, any>>({})
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Students draft freely but cannot leave draft without an accepted sponsor.
  const isStudent = !!auth.profile?.roles?.includes('student')

  const steps = GRANT_APPLICATION_STEPS
  const stepNames = steps.map((s) => s.title)
  const totalSteps = steps.length
  const isReviewStep = currentStep === totalSteps - 1
  const currentStepConfig = steps[currentStep]

  const getTitle = () => applicationData.title || 'Untitled Application'

  // Hydrate from existing draft once; redirect if already submitted
  const hasLoadedDraftRef = useRef(false)
  useEffect(() => {
    if (!existingApplication || hasLoadedDraftRef.current) return
    if (existingApplication.status !== 'draft') {
      toast.info('You have already applied for this grant.')
      navigate(`/grants/${params.id}`, { replace: true })
      return
    }
    hasLoadedDraftRef.current = true
    setApplicationData(existingApplication.application_data || {})
    setCurrentStep(Math.min(existingApplication.current_step || 0, totalSteps - 1))
    setApplicationId(existingApplication.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingApplication])

  // Guards once grant is loaded
  const isExpired = !!(grant && grant.deadline && new Date(grant.deadline) < new Date())
  useEffect(() => {
    if (grantLoading || !grant) return
    if (!grant.is_active || isExpired || grant.application_url) {
      navigate(`/grants/${grant.id}`, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantLoading, grant?.id])

  const persistDraft = async () => {
    if (!grant || !auth.user) return
    const saved = await saveDraft({
      grant_id: grant.id,
      user_id: auth.user.id,
      application_data: applicationData,
      current_step: currentStep,
    })
    if (saved) setApplicationId(saved.id)
  }

  const autoSave = useAutoSave({
    delay: 5000,
    onSave: persistDraft,
  })

  const handleFieldChange = (field: string, value: string) => {
    setApplicationData((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    autoSave.trigger()
  }

  const validateStep = (stepIndex: number, data: Record<string, any>): Record<string, string> => {
    const stepErrors: Record<string, string> = {}
    for (const field of steps[stepIndex].fields) {
      if (field.required) {
        const val = data[field.name]
        if (!val || !String(val).trim()) {
          stepErrors[field.name] = `${field.label} is required`
        }
      }
    }
    return stepErrors
  }

  const validateCurrentStep = (): boolean => {
    const newErrors = validateStep(currentStep, applicationData)
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSaveDraft = async () => {
    try {
      autoSave.cancel()
      await persistDraft()
      toast.success('Draft saved')
    } catch {
      toast.error('Failed to save draft')
    }
  }

  const handleNext = async () => {
    if (!validateCurrentStep()) return
    try {
      autoSave.cancel()
      await persistDraft()
    } catch {
      // keep going; autosave will retry
    }
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBack = () => {
    setErrors({})
    setCurrentStep((prev) => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleStepClick = (step: number) => {
    setErrors({})
    setCurrentStep(step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
    // Validate every step before submitting; jump to the first incomplete one
    for (let i = 0; i < totalSteps; i++) {
      const stepErrors = validateStep(i, applicationData)
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors)
        setCurrentStep(i)
        toast.error(`Please complete the "${steps[i].title}" step`)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
    }

    try {
      autoSave.cancel()
      let id = applicationId
      if (!id) {
        const saved = await saveDraft({
          grant_id: grant!.id,
          user_id: auth.user!.id,
          application_data: applicationData,
          current_step: currentStep,
        })
        id = saved.id
        setApplicationId(id)
      }
      await submitApplication({
        id: id!,
        user_id: auth.user!.id,
        application_data: applicationData,
        current_step: currentStep,
      })
      toast.success('Application submitted! A copy is saved in your dashboard.')

      // The submit trigger writes the receipt, so it exists by now. Fall back to
      // the applications list if it can't be read for any reason.
      let receipt = null
      try {
        receipt = await fetchReceiptBySource('grant_applications', id!)
      } catch {
        // ignore — fall through to the list
      }
      navigate(receipt ? `/dashboard/submissions/${receipt.id}` : '/grants/my-applications')
    } catch (error: any) {
      console.error('Submit error:', error)
      toast.error('Failed to submit application')
    }
  }

  if (grantLoading || !grant || applicationLoading) {
    return (
      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
        <p className="mt-4 text-ktip-sand-600">Loading application...</p>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow="Grant Application"
        title={grant.title}
        image={grantImageFor(grant.id, grant.grant_type, grant.is_climate_action)}
        imageSeed={grant.id}
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Grants', href: '/grants' },
          { label: truncate(grant.title, 30), href: `/grants/${grant.id}` },
          { label: 'Apply' },
        ]}
      >
        <p className="text-sm text-white/70 mt-1 flex items-center">
          Step {currentStep + 1} of {totalSteps}
          <SaveStatusBadge status={autoSave.status} />
        </p>
      </PageHero>

      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-[calc(50vw+28rem)] mx-auto px-4">
          {/* Stepper */}
          <div id="steps" data-spy="Steps" className="scroll-mt-24 border border-ktip-sand-200 rounded-2xl p-4 mb-6">
            <Stepper
              steps={stepNames}
              currentStep={currentStep}
              onStepClick={handleStepClick}
            />
          </div>

          {/* Content */}
          <div
            id="form"
            data-spy="Form"
            className="scroll-mt-24 border border-ktip-sand-200 rounded-2xl p-6 md:p-8"
          >
            <StepForm
              step={currentStepConfig}
              data={applicationData}
              onChange={handleFieldChange}
              errors={errors}
              grantTitle={grant.title}
              applicationTitle={getTitle()}
              applicationId={applicationId}
              requiredDocuments={grant.required_documents}
              onSaveDraft={persistDraft}
            />

            {isReviewStep && isStudent && (
              <div className="mt-8">
                <SponsorNominationCard
                  applicationId={applicationId ?? undefined}
                  applicantId={auth.user!.id}
                  sponsorId={(existingApplication as any)?.sponsor_id ?? null}
                  sponsorApprovedAt={(existingApplication as any)?.sponsor_approved_at ?? null}
                />
              </div>
            )}

            {isReviewStep && (
              <div id="review" data-spy="Review" className="scroll-mt-24 mt-8">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-ktip-sand-900">Review & Submit</h3>
                  <p className="text-sm text-ktip-sand-500 mt-1">
                    Review your application before submitting. You can go back to edit any section.
                  </p>
                </div>
                <div className="border border-ktip-sand-200 rounded-xl p-6 bg-ktip-sand-50/30">
                  <ApplicationPreview
                    title={getTitle()}
                    grantTitle={grant.title}
                    data={applicationData}
                  />
                </div>

                <AIReviewPanel
                  grantTitle={grant.title}
                  applicationTitle={getTitle()}
                  applicationData={applicationData}
                />
              </div>
            )}
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-6">
            {currentStep > 0 ? (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-ktip-sand-600 hover:text-ktip-sand-800 transition-colors"
              >
                <ArrowLeft size={16} />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(`/grants/${grant.id}`)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-ktip-sand-600 hover:text-ktip-sand-800 transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Grant
              </button>
            )}

            <div className="flex items-center gap-3">
              {/* Save Draft */}
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Draft
              </button>

              {/* Next / Submit */}
              {!isReviewStep ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-navy text-white dark:bg-brand-green dark:text-brand-navy rounded-xl text-sm font-medium hover:bg-brand-green hover:text-brand-navy dark:hover:bg-brand-navy dark:hover:text-brand-green transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : 'Next'}
                  {!saving && <ArrowRight size={16} />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-ktip-tropical-500 text-brand-navy rounded-xl text-sm font-medium hover:bg-ktip-tropical-600 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Submit Application
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
