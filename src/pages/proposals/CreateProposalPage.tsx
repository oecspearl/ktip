import { createSignal, Show, For, createEffect, on, createResource } from 'solid-js'
import { A, useNavigate, useSearchParams } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { Stepper } from '../../components/proposals/Stepper'
import { StepForm } from '../../components/proposals/StepForm'
import { ProposalPreview } from '../../components/proposals/ProposalPreview'
import { ProposalExportActions } from '../../components/proposals/ProposalExportActions'
import { AIReviewPanel } from '../../components/proposals/AIReviewPanel'
import { useCreateProposal, useUpdateProposal, useProposal } from '../../hooks/useProposals'
import { PROPOSAL_STEPS } from '../../lib/proposal-templates'
import { PROPOSAL_TYPE_LABELS } from '../../lib/constants'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAutoSave } from '../../hooks/useAutoSave'
import { SaveStatusBadge } from '../../components/proposals/SaveStatusBadge'
import { supabase } from '../../lib/supabase'
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
  ChevronRight,
} from 'lucide-solid'
import type { ProposalType } from '../../types'

const PROPOSAL_TYPE_CARDS: { type: ProposalType; label: string; description: string; icon: any; color: string }[] = [
  {
    type: 'funding',
    label: 'Funding / Grant',
    description: 'Request funding for initiatives with clear goals, budgets, and impact metrics.',
    icon: FileText,
    color: 'text-purple-600',
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
    color: 'text-indigo-600',
  },
  {
    type: 'business',
    label: 'Business',
    description: 'Build a business case with market analysis, revenue model, and financial projections.',
    icon: Building,
    color: 'text-ktip-tropical-600',
  },
]

export default function CreateProposalPage() {
  usePageTitle(() => 'Create Proposal')

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // If resuming a draft, load it
  const draftId = () => searchParams.draft as string | undefined
  const { proposal: existingProposal } = useProposal(draftId)

  // If coming from a project, link the proposal to it
  const projectId = () => searchParams.project as string | undefined
  const [projectTitle] = createResource(projectId, async (pid) => {
    const { data } = await supabase.from('projects').select('title').eq('id', pid).single()
    return data?.title || null
  })

  // Core state
  const [selectedType, setSelectedType] = createSignal<ProposalType | null>(null)
  const [currentStep, setCurrentStep] = createSignal(0)
  const [proposalData, setProposalData] = createSignal<Record<string, any>>({})
  const [proposalId, setProposalId] = createSignal<string | null>(null)
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [saving, setSaving] = createSignal(false)

  const { createProposal } = useCreateProposal()
  const { updateProposal } = useUpdateProposal()

  // Auto-save (wired after saveDraft is defined below)
  const autoSave = useAutoSave({
    delay: 5000,
    onSave: async () => {
      const type = selectedType()
      if (!type) return
      const data = proposalData()
      const title = data.title || 'Untitled Proposal'
      if (proposalId()) {
        await updateProposal(proposalId()!, { title, proposal_data: data, current_step: currentStep() })
      } else {
        const created = await createProposal({ type, title, proposal_data: data, current_step: currentStep(), project_id: projectId() })
        if (created) setProposalId(created.id)
      }
    },
  })

  // Load existing draft data
  createEffect(on(() => existingProposal(), (draft) => {
    if (draft) {
      setSelectedType(draft.type)
      setCurrentStep(draft.current_step)
      setProposalData(draft.proposal_data || {})
      setProposalId(draft.id)
    }
  }))

  const steps = () => {
    const type = selectedType()
    if (!type) return []
    return PROPOSAL_STEPS[type]
  }

  const stepNames = () => [...steps().map(s => s.title), 'Review & Submit']
  const totalSteps = () => steps().length + 1 // +1 for review
  const isReviewStep = () => currentStep() === steps().length
  const currentStepConfig = () => steps()[currentStep()]

  const getTitle = () => {
    const data = proposalData()
    return data.title || 'Untitled Proposal'
  }

  // --- Field change handler ---
  const handleFieldChange = (field: string, value: string) => {
    setProposalData(prev => ({ ...prev, [field]: value }))
    setErrors(prev => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    if (selectedType()) autoSave.trigger()
  }

  // --- Validation ---
  const validateCurrentStep = (): boolean => {
    const step = currentStepConfig()
    if (!step) return true

    const newErrors: Record<string, string> = {}
    for (const field of step.fields) {
      if (field.required) {
        const val = proposalData()[field.name]
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
    const type = selectedType()
    if (!type) return

    setSaving(true)
    try {
      const data = proposalData()
      const title = data.title || 'Untitled Proposal'

      if (proposalId()) {
        await updateProposal(proposalId()!, {
          title,
          proposal_data: data,
          current_step: currentStep(),
        })
      } else {
        const created = await createProposal({
          type,
          title,
          proposal_data: data,
          current_step: currentStep(),
          project_id: projectId(),
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
    setCurrentStep(prev => Math.min(prev + 1, totalSteps() - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBack = () => {
    setErrors({})
    setCurrentStep(prev => Math.max(prev - 1, 0))
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
      const data = proposalData()
      const title = data.title || 'Untitled Proposal'

      if (proposalId()) {
        await updateProposal(proposalId()!, {
          title,
          proposal_data: data,
          current_step: currentStep(),
          status: 'completed',
        })
        navigate(`/proposals/${proposalId()}`)
      } else {
        const created = await createProposal({
          type: selectedType()!,
          title,
          proposal_data: data,
          current_step: currentStep(),
          project_id: projectId(),
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

  // --- Type Selection View ---
  const TypeSelection = () => (
    <div class="bg-white py-12">
      <div class="max-w-3xl mx-auto px-4">
        <div class="text-center mb-8">
          <h2 class="text-xl font-bold text-ktip-sand-900 font-display">Choose Proposal Type</h2>
          <p class="text-sm text-ktip-sand-500 mt-2">
            Select the type of proposal you want to create. Each template follows global best practices.
          </p>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <For each={PROPOSAL_TYPE_CARDS}>
            {(card) => {
              const Icon = card.icon
              return (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType(card.type)
                    setCurrentStep(0)
                    setProposalData({})
                    setProposalId(null)
                    setErrors({})
                  }}
                  class="flex items-start gap-4 border border-gray-200 p-6 rounded-2xl text-left hover:border-ktip-ocean-400 hover:shadow-card transition-all group"
                >
                  <div class={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${card.color} bg-gray-50`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3 class="font-semibold text-ktip-sand-900 group-hover:text-ktip-ocean-600 transition-colors">
                      {card.label}
                    </h3>
                    <p class="text-sm text-ktip-sand-500 mt-1">{card.description}</p>
                    <span class="text-xs text-ktip-ocean-600 font-medium mt-2 inline-block">
                      {PROPOSAL_STEPS[card.type].length} guided steps →
                    </span>
                  </div>
                </button>
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )

  return (
    <MainLayout>
      {/* Dark Hero */}
      <div class="bg-gray-800 min-h-[180px] flex items-center">
        <div class="container mx-auto px-4 flex items-center justify-between w-full">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Create Proposal</p>
            <h1 class="text-3xl font-display font-bold text-white">
              {selectedType() ? `${PROPOSAL_TYPE_LABELS[selectedType()!]} Wizard` : 'New Proposal'}
            </h1>
            <Show when={projectTitle()}>
              <p class="text-xs text-ktip-ocean-400 font-medium mt-1">
                For project: {projectTitle()}
              </p>
            </Show>
            <Show when={selectedType()}>
              <p class="text-sm text-gray-400 mt-1 flex items-center">
                Step {currentStep() + 1} of {totalSteps()}
                <SaveStatusBadge status={autoSave.status()} />
              </p>
            </Show>
          </div>
          <nav class="hidden sm:flex items-center gap-1 text-sm text-gray-400">
            <A href="/" class="hover:text-white transition-colors">Home</A>
            <ChevronRight size={14} />
            <A href="/proposals" class="hover:text-white transition-colors">Proposals</A>
            <ChevronRight size={14} />
            <span class="text-gray-200">Create</span>
          </nav>
        </div>
      </div>

      {/* Type selection or wizard */}
      <Show when={selectedType()} fallback={<TypeSelection />}>
        <div class="bg-white py-12">
          <div class="max-w-4xl mx-auto px-4">
            {/* Stepper */}
            <div class="border border-gray-200 rounded-2xl p-4 mb-6">
              <Stepper
                steps={stepNames()}
                currentStep={currentStep()}
                onStepClick={handleStepClick}
              />
            </div>

            {/* Content */}
            <div class="border border-gray-200 rounded-2xl p-6 md:p-8">
              <Show
                when={!isReviewStep()}
                fallback={
                  <div>
                    <div class="flex items-center justify-between mb-6">
                      <div>
                        <h3 class="text-lg font-semibold text-ktip-sand-900">Review & Submit</h3>
                        <p class="text-sm text-ktip-sand-500 mt-1">
                          Review your proposal before completing it. You can go back to edit any section.
                        </p>
                      </div>
                      <ProposalExportActions
                        type={selectedType()!}
                        title={getTitle()}
                        data={proposalData()}
                      />
                    </div>
                    <div class="border border-ktip-sand-200 rounded-xl p-6 bg-ktip-sand-50/30">
                      <ProposalPreview
                        type={selectedType()!}
                        title={getTitle()}
                        data={proposalData()}
                      />
                    </div>

                    <AIReviewPanel
                      proposalType={selectedType()!}
                      proposalTitle={getTitle()}
                      proposalData={proposalData()}
                    />
                  </div>
                }
              >
                <StepForm
                  step={currentStepConfig()!}
                  data={proposalData()}
                  onChange={handleFieldChange}
                  errors={errors()}
                  proposalType={selectedType()!}
                  proposalTitle={getTitle()}
                />
              </Show>
            </div>

            {/* Navigation Buttons */}
            <div class="flex items-center justify-between mt-6">
              <Show
                when={currentStep() > 0}
                fallback={
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedType(null)
                      setCurrentStep(0)
                      setProposalData({})
                      setErrors({})
                    }}
                    class="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-ktip-sand-600 hover:text-ktip-sand-800 transition-colors"
                  >
                    <ArrowLeft size={16} />
                    Change Type
                  </button>
                }
              >
                <button
                  type="button"
                  onClick={handleBack}
                  class="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-ktip-sand-600 hover:text-ktip-sand-800 transition-colors"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              </Show>

              <div class="flex items-center gap-3">
                {/* Save Draft */}
                <Show when={!isReviewStep()}>
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={saving()}
                    class="inline-flex items-center gap-2 px-4 py-2.5 border border-ktip-sand-200 rounded-xl text-sm font-medium text-ktip-sand-700 hover:bg-ktip-sand-50 transition-colors disabled:opacity-50"
                  >
                    {saving() ? <Loader2 size={16} class="animate-spin" /> : <Save size={16} />}
                    Save Draft
                  </button>
                </Show>

                {/* Next / Complete */}
                <Show
                  when={!isReviewStep()}
                  fallback={
                    <button
                      type="button"
                      onClick={handleComplete}
                      disabled={saving()}
                      class="inline-flex items-center gap-2 px-6 py-2.5 bg-ktip-tropical-500 text-white rounded-xl text-sm font-medium hover:bg-ktip-tropical-600 transition-colors disabled:opacity-50"
                    >
                      {saving() ? <Loader2 size={16} class="animate-spin" /> : <CheckCircle size={16} />}
                      Complete Proposal
                    </button>
                  }
                >
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={saving()}
                    class="inline-flex items-center gap-2 px-6 py-2.5 bg-ktip-ocean-500 text-white rounded-xl text-sm font-medium hover:bg-ktip-ocean-600 transition-colors disabled:opacity-50"
                  >
                    {saving() ? <Loader2 size={16} class="animate-spin" /> : 'Next'}
                    <Show when={!saving()}>
                      <ArrowRight size={16} />
                    </Show>
                  </button>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </MainLayout>
  )
}
