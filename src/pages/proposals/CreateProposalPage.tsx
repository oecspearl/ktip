import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Stepper } from '../../components/proposals/Stepper'
import { StepForm } from '../../components/proposals/StepForm'
import { ProposalPreview } from '../../components/proposals/ProposalPreview'
import { ProposalExportActions } from '../../components/proposals/ProposalExportActions'
import { AIReviewPanel } from '../../components/proposals/AIReviewPanel'
import { useCreateProposal, useUpdateProposal, useProposal } from '../../hooks/useProposals'
import { useProject } from '../../hooks/useProjects'
import { PROPOSAL_STEPS } from '../../lib/proposal-templates'
import { PROPOSAL_TYPE_LABELS } from '../../lib/constants'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAutoSave } from '../../hooks/useAutoSave'
import { SaveStatusBadge } from '../../components/proposals/SaveStatusBadge'
import { PageHero } from '../../components/layout/PageHero'
import {
  ArrowLeft,
  ArrowRight,
  Save,
  CheckCircle,
  FileText,
  Briefcase,
  GraduationCap,
  Building,
  Loader2,
} from 'lucide-react'
import type { ProposalType } from '../../types'

const PROPOSAL_TYPE_CARDS: { type: ProposalType; label: string; description: string; icon: any; color: string }[] = [
  {
    type: 'funding',
    label: 'Funding / Grant',
    description: 'Request funding for initiatives with clear goals, budgets, and impact metrics.',
    icon: FileText,
    color: 'text-ktip-ocean-600',
  },
  {
    type: 'project',
    label: 'Project',
    description: 'Plan project execution with scope, deliverables, timeline, and risk assessment.',
    icon: Briefcase,
    color: 'text-ktip-ocean-600',
  },
  {
    type: 'research',
    label: 'Research',
    description: 'Design a research study with methodology, expected outcomes, and dissemination.',
    icon: GraduationCap,
    color: 'text-ktip-ocean-600',
  },
  {
    type: 'business',
    label: 'Business',
    description: 'Build a business case with market analysis, revenue model, and financial projections.',
    icon: Building,
    color: 'text-ktip-tropical-600',
  },
]

interface TypeSelectionProps {
  onSelect: (type: ProposalType) => void
}

function TypeSelection({ onSelect }: TypeSelectionProps) {
  return (
    <div className="bg-ktip-sand-50 py-12">
      <div className="max-w-[calc(50vw+24rem)] mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-ktip-sand-900 font-display">Choose Proposal Type</h2>
          <p className="text-sm text-ktip-sand-500 mt-2">
            Select the type of proposal you want to create. Each template follows global best practices.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {PROPOSAL_TYPE_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.type}
                type="button"
                onClick={() => onSelect(card.type)}
                className="flex items-start gap-4 border border-gray-200 p-6 rounded-2xl text-left hover:border-ktip-ocean-400 hover:shadow-card transition-all group"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${card.color} bg-gray-50`}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-ktip-sand-900 group-hover:text-ktip-ocean-600 transition-colors">
                    {card.label}
                  </h3>
                  <p className="text-sm text-ktip-sand-500 mt-1">{card.description}</p>
                  <span className="text-xs text-ktip-ocean-600 font-medium mt-2 inline-block">
                    {PROPOSAL_STEPS[card.type].length} guided steps &rarr;
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function CreateProposalPage() {
  usePageTitle('Create Proposal')

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // If resuming a draft, load it
  const draftId = searchParams.get('draft') || undefined
  const { proposal: existingProposal } = useProposal(draftId)

  // If coming from a project, link the proposal to it
  const projectId = searchParams.get('project') || undefined
  const { project } = useProject(projectId)
  const projectTitle = project?.title || null

  // Core state
  const [selectedType, setSelectedType] = useState<ProposalType | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [proposalData, setProposalData] = useState<Record<string, any>>({})
  const [proposalId, setProposalId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const { createProposal } = useCreateProposal()
  const { updateProposal } = useUpdateProposal()

  // Auto-save
  const autoSave = useAutoSave({
    delay: 5000,
    onSave: async () => {
      const type = selectedType
      if (!type) return
      const data = proposalData
      const title = data.title || 'Untitled Proposal'
      if (proposalId) {
        await updateProposal(proposalId, { title, proposal_data: data, current_step: currentStep })
      } else {
        const created = await createProposal({ type, title, proposal_data: data, current_step: currentStep, project_id: projectId })
        if (created) setProposalId(created.id)
      }
    },
  })

  // Load existing draft data — only apply once, when it first becomes available,
  // so subsequent background refetches (e.g. triggered by autosave's cache
  // invalidation) don't clobber in-progress local edits.
  const hasLoadedDraftRef = useRef(false)
  useEffect(() => {
    if (existingProposal && !hasLoadedDraftRef.current) {
      hasLoadedDraftRef.current = true
      setSelectedType(existingProposal.type)
      setCurrentStep(existingProposal.current_step)
      setProposalData(existingProposal.proposal_data || {})
      setProposalId(existingProposal.id)
    }
  }, [existingProposal])

  const steps = selectedType ? PROPOSAL_STEPS[selectedType] : []
  const stepNames = [...steps.map((s) => s.title), 'Review & Submit']
  const totalSteps = steps.length + 1 // +1 for review
  const isReviewStep = currentStep === steps.length
  const currentStepConfig = steps[currentStep]

  const getTitle = () => proposalData.title || 'Untitled Proposal'

  // --- Field change handler ---
  const handleFieldChange = (field: string, value: string) => {
    setProposalData((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    if (selectedType) autoSave.trigger()
  }

  // --- Validation ---
  const validateCurrentStep = (): boolean => {
    const step = currentStepConfig
    if (!step) return true

    const newErrors: Record<string, string> = {}
    for (const field of step.fields) {
      if (field.required) {
        const val = proposalData[field.name]
        if (!val || !String(val).trim()) {
          newErrors[field.name] = `${field.label} is required`
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // --- Save / persist draft ---
  const saveDraft = async () => {
    const type = selectedType
    if (!type) return

    setSaving(true)
    try {
      const data = proposalData
      const title = data.title || 'Untitled Proposal'

      if (proposalId) {
        await updateProposal(proposalId, {
          title,
          proposal_data: data,
          current_step: currentStep,
        })
      } else {
        const created = await createProposal({
          type,
          title,
          proposal_data: data,
          current_step: currentStep,
          project_id: projectId,
        })
        if (created) {
          setProposalId(created.id)
        }
      }
    } catch {
      // Error handled by hook
    } finally {
      setSaving(false)
    }
  }

  // --- Navigation ---
  const handleNext = async () => {
    if (!validateCurrentStep()) return
    await saveDraft()
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

  const handleComplete = async () => {
    setSaving(true)
    try {
      const data = proposalData
      const title = data.title || 'Untitled Proposal'

      if (proposalId) {
        await updateProposal(proposalId, {
          title,
          proposal_data: data,
          current_step: currentStep,
          status: 'completed',
        })
        navigate(`/proposals/${proposalId}`)
      } else {
        const created = await createProposal({
          type: selectedType!,
          title,
          proposal_data: data,
          current_step: currentStep,
          project_id: projectId,
        })
        if (created) {
          await updateProposal(created.id, { status: 'completed' })
          navigate(`/proposals/${created.id}`)
        }
      }
    } catch {
      // Error handled by hook
    } finally {
      setSaving(false)
    }
  }

  const handleSelectType = (type: ProposalType) => {
    setSelectedType(type)
    setCurrentStep(0)
    setProposalData({})
    setProposalId(null)
    setErrors({})
  }

  const handleChangeType = () => {
    setSelectedType(null)
    setCurrentStep(0)
    setProposalData({})
    setErrors({})
  }

  return (
    <>
      <PageHero
        eyebrow="Create Proposal"
        title={selectedType ? `${PROPOSAL_TYPE_LABELS[selectedType]} Wizard` : 'New Proposal'}
        imageSeed="proposals"
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Proposals', href: '/proposals' },
          { label: 'Create' },
        ]}
      >
        {projectTitle && (
          <p className="text-xs text-ktip-nav-accent font-medium">
            For project: {projectTitle}
          </p>
        )}
        {selectedType && (
          <p className="text-sm text-white/70 mt-1 flex items-center">
            Step {currentStep + 1} of {totalSteps}
            <SaveStatusBadge status={autoSave.status} />
          </p>
        )}
      </PageHero>

      {/* Type selection or wizard */}
      {!selectedType ? (
        <TypeSelection onSelect={handleSelectType} />
      ) : (
        <div className="bg-ktip-sand-50 py-12">
          <div className="max-w-[calc(50vw+28rem)] mx-auto px-4">
            {/* Stepper */}
            <div className="border border-gray-200 rounded-2xl p-4 mb-6">
              <Stepper
                steps={stepNames}
                currentStep={currentStep}
                onStepClick={handleStepClick}
              />
            </div>

            {/* Content */}
            <div className="border border-gray-200 rounded-2xl p-6 md:p-8">
              {!isReviewStep ? (
                <StepForm
                  step={currentStepConfig!}
                  data={proposalData}
                  onChange={handleFieldChange}
                  errors={errors}
                  proposalType={selectedType}
                  proposalTitle={getTitle()}
                />
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-ktip-sand-900">Review & Submit</h3>
                      <p className="text-sm text-ktip-sand-500 mt-1">
                        Review your proposal before completing it. You can go back to edit any section.
                      </p>
                    </div>
                    <ProposalExportActions
                      type={selectedType}
                      title={getTitle()}
                      data={proposalData}
                    />
                  </div>
                  <div className="border border-ktip-sand-200 rounded-xl p-6 bg-ktip-sand-50/30">
                    <ProposalPreview
                      type={selectedType}
                      title={getTitle()}
                      data={proposalData}
                    />
                  </div>

                  <AIReviewPanel
                    proposalType={selectedType}
                    proposalTitle={getTitle()}
                    proposalData={proposalData}
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
                  onClick={handleChangeType}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-ktip-sand-600 hover:text-ktip-sand-800 transition-colors"
                >
                  <ArrowLeft size={16} />
                  Change Type
                </button>
              )}

              <div className="flex items-center gap-3">
                {/* Save Draft */}
                {!isReviewStep && (
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2.5 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Draft
                  </button>
                )}

                {/* Next / Complete */}
                {!isReviewStep ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-ktip-ocean-500 text-white rounded-xl text-sm font-medium hover:bg-ktip-ocean-600 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : 'Next'}
                    {!saving && <ArrowRight size={16} />}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-ktip-tropical-500 text-brand-navy rounded-xl text-sm font-medium hover:bg-ktip-tropical-600 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    Complete Proposal
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
