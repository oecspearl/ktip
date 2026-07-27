import { createSignal, Show, For } from 'solid-js'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'

interface UATFeedbackFormProps {
  open: boolean
  onClose: () => void
}

type Step = 'usefulness' | 'experience' | 'open_feedback'

const USEFULNESS_OPTIONS = [
  { value: 'very_useful', label: 'Very useful' },
  { value: 'somewhat', label: 'Somewhat useful' },
  { value: 'not_very', label: 'Not very useful' },
  { value: 'not_at_all', label: 'Not at all useful' },
] as const

const FEATURE_OPTIONS = [
  { value: 'projects', label: 'Projects' },
  { value: 'events', label: 'Events' },
  { value: 'grants', label: 'Grants' },
  { value: 'forums', label: 'Forums' },
  { value: 'collaboration', label: 'Collaboration Tools' },
  { value: 'directory', label: 'Member Directory' },
  { value: 'resources', label: 'Resources' },
  { value: 'proposals', label: 'Proposals' },
] as const

const YES_SOMEWHAT_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'somewhat', label: 'Somewhat' },
  { value: 'no', label: 'No' },
] as const

const NAVIGATION_OPTIONS = [
  { value: 'very_easy', label: 'Very easy' },
  { value: 'easy', label: 'Easy' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'difficult', label: 'Difficult' },
  { value: 'very_difficult', label: 'Very difficult' },
] as const

const EXPERIENCE_OPTIONS = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'average', label: 'Average' },
  { value: 'poor', label: 'Poor' },
  { value: 'very_poor', label: 'Very poor' },
] as const

const PERFORMANCE_OPTIONS = [
  { value: 'fast', label: 'Fast' },
  { value: 'acceptable', label: 'Acceptable' },
  { value: 'slow', label: 'Slow' },
] as const

export function UATFeedbackForm(props: UATFeedbackFormProps) {
  const toast = useToast()

  const [step, setStep] = createSignal<Step>('usefulness')
  const [submitting, setSubmitting] = createSignal(false)
  const [errors, setErrors] = createSignal<Record<string, string>>({})

  // Section 1: Usefulness & Value
  const [q1, setQ1] = createSignal('')
  const [q2, setQ2] = createSignal<string[]>([])
  const [q3, setQ3] = createSignal('')
  const [q4, setQ4] = createSignal('')
  const [q5, setQ5] = createSignal<number | null>(null)

  // Section 2: User Experience
  const [q6, setQ6] = createSignal('')
  const [q7, setQ7] = createSignal('')
  const [q8, setQ8] = createSignal('')
  const [q9, setQ9] = createSignal<boolean | null>(null)
  const [q9Detail, setQ9Detail] = createSignal('')
  const [q10, setQ10] = createSignal('')

  // Section 3: Open Feedback
  const [q11, setQ11] = createSignal('')
  const [q12, setQ12] = createSignal('')

  const toggleFeature = (value: string) => {
    setQ2((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  const validateUsefulness = () => {
    const errs: Record<string, string> = {}
    if (!q1()) errs.q1 = 'Required'
    if (q2().length === 0) errs.q2 = 'Select at least one feature'
    if (!q3()) errs.q3 = 'Required'
    if (!q4()) errs.q4 = 'Required'
    if (q5() === null) errs.q5 = 'Required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validateExperience = () => {
    const errs: Record<string, string> = {}
    if (!q6()) errs.q6 = 'Required'
    if (!q7()) errs.q7 = 'Required'
    if (!q8()) errs.q8 = 'Required'
    if (q9() === null) errs.q9 = 'Required'
    if (!q10()) errs.q10 = 'Required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = () => {
    if (step() === 'usefulness') {
      if (validateUsefulness()) {
        setStep('experience')
        setErrors({})
      }
    } else if (step() === 'experience') {
      if (validateExperience()) {
        setStep('open_feedback')
        setErrors({})
      }
    }
  }

  const handleBack = () => {
    if (step() === 'experience') setStep('usefulness')
    if (step() === 'open_feedback') setStep('experience')
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const { error } = await supabase.from('uat_responses' as any).insert({
        q1_usefulness: q1(),
        q2_valuable_features: q2(),
        q3_connect_innovators: q3(),
        q4_discover_opportunities: q4(),
        q5_recommend_rating: q5(),
        q6_ease_of_navigation: q6(),
        q7_professional: q7(),
        q8_overall_experience: q8(),
        q9_issues: q9(),
        q9_issues_detail: q9Detail() || null,
        q10_performance: q10(),
        q11_improvements: q11() || null,
        q12_comments: q12() || null,
      } as any)

      if (error) throw error

      toast.success('Thank you for your feedback!')
      localStorage.setItem('ktip_uat_submitted', 'true')
      localStorage.setItem('ktip_uat_submitted_at', new Date().toISOString())
      props.onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit feedback')
    } finally {
      setSubmitting(false)
    }
  }

  const RadioGroup = (groupProps: {
    name: string
    options: readonly { value: string; label: string }[]
    value: string
    onChange: (v: string) => void
    error?: string
  }) => (
    <div class="space-y-2">
      <For each={[...groupProps.options]}>
        {(opt) => (
          <label
            class={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition-all',
              groupProps.value === opt.value
                ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                : 'border-ktip-sand-200 hover:border-ktip-sand-300 hover:bg-ktip-sand-50'
            )}
          >
            <input
              type="radio"
              name={groupProps.name}
              value={opt.value}
              checked={groupProps.value === opt.value}
              onChange={() => groupProps.onChange(opt.value)}
              class="w-4 h-4 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
            />
            <span class="text-sm font-medium">{opt.label}</span>
          </label>
        )}
      </For>
      <Show when={groupProps.error}>
        <p class="text-sm text-red-500">{groupProps.error}</p>
      </Show>
    </div>
  )

  const BooleanChoice = (boolProps: {
    name: string
    value: boolean | null
    onChange: (v: boolean) => void
    error?: string
  }) => (
    <div class="space-y-2">
      <div class="flex gap-3">
        <label
          class={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all flex-1 justify-center',
            boolProps.value === true
              ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
              : 'border-ktip-sand-200 hover:border-ktip-sand-300'
          )}
        >
          <input
            type="radio"
            name={boolProps.name}
            checked={boolProps.value === true}
            onChange={() => boolProps.onChange(true)}
            class="w-4 h-4 text-ktip-ocean-600"
          />
          <span class="text-sm font-medium">Yes</span>
        </label>
        <label
          class={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all flex-1 justify-center',
            boolProps.value === false
              ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
              : 'border-ktip-sand-200 hover:border-ktip-sand-300'
          )}
        >
          <input
            type="radio"
            name={boolProps.name}
            checked={boolProps.value === false}
            onChange={() => boolProps.onChange(false)}
            class="w-4 h-4 text-ktip-ocean-600"
          />
          <span class="text-sm font-medium">No</span>
        </label>
      </div>
      <Show when={boolProps.error}>
        <p class="text-sm text-red-500">{boolProps.error}</p>
      </Show>
    </div>
  )

  const RatingScale = (ratingProps: {
    value: number | null
    onChange: (v: number) => void
    error?: string
  }) => (
    <div class="space-y-2">
      <div class="flex gap-2">
        <For each={[1, 2, 3, 4, 5]}>
          {(n) => (
            <button
              type="button"
              onClick={() => ratingProps.onChange(n)}
              class={cn(
                'w-12 h-12 rounded-xl border-2 font-bold text-lg transition-all',
                ratingProps.value === n
                  ? 'border-ktip-ocean-500 bg-ktip-ocean-500 text-white scale-110'
                  : 'border-ktip-sand-200 hover:border-ktip-ocean-300 text-ktip-sand-600 hover:bg-ktip-ocean-50'
              )}
            >
              {n}
            </button>
          )}
        </For>
      </div>
      <div class="flex justify-between text-xs text-ktip-sand-500 px-1">
        <span>Not likely</span>
        <span>Very likely</span>
      </div>
      <Show when={ratingProps.error}>
        <p class="text-sm text-red-500">{ratingProps.error}</p>
      </Show>
    </div>
  )

  const stepIndicator = () => {
    const steps: { key: Step; label: string }[] = [
      { key: 'usefulness', label: 'Usefulness' },
      { key: 'experience', label: 'Experience' },
      { key: 'open_feedback', label: 'Feedback' },
    ]
    const currentIdx = steps.findIndex((s) => s.key === step())

    return (
      <div class="flex items-center gap-2 mb-6">
        <For each={steps}>
          {(_s, idx) => (
            <>
              <Show when={idx() > 0}>
                <div class={cn('flex-1 h-0.5', idx() <= currentIdx ? 'bg-ktip-ocean-500' : 'bg-ktip-sand-200')} />
              </Show>
              <div
                class={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all',
                  idx() < currentIdx
                    ? 'bg-ktip-ocean-500 text-white'
                    : idx() === currentIdx
                      ? 'bg-ktip-ocean-500 text-white ring-4 ring-ktip-ocean-100'
                      : 'bg-ktip-sand-100 text-ktip-sand-500'
                )}
              >
                {idx() + 1}
              </div>
            </>
          )}
        </For>
      </div>
    )
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Platform Feedback"
      description="Help us improve KTIP. Your responses are anonymous and only take a few minutes."
      size="xl"
    >
      <div class="space-y-6">
        {/* Logo */}
        <div class="flex justify-center">
          <img
            src="/pwa-512x512.png"
            alt="KTIP Logo"
            class="w-16 h-16 rounded-full object-cover"
          />
        </div>

        {stepIndicator()}

        {/* Step 1: Usefulness & Value */}
        <Show when={step() === 'usefulness'}>
          <div class="space-y-6">
            <div class="bg-ktip-ocean-50 rounded-xl px-4 py-3">
              <h3 class="font-display font-semibold text-ktip-ocean-700">Usefulness & Value</h3>
              <p class="text-xs text-ktip-ocean-600 mt-0.5">
                Help us understand how valuable the platform is for your work.
              </p>
            </div>

            {/* Q1 */}
            <div class="space-y-2">
              <p class="text-sm font-medium text-ktip-sand-800">
                1. How useful is this platform for your work or interests? <span class="text-red-500">*</span>
              </p>
              <RadioGroup name="q1" options={USEFULNESS_OPTIONS} value={q1()} onChange={setQ1} error={errors().q1} />
            </div>

            {/* Q2 - Multi-select */}
            <div class="space-y-2">
              <p class="text-sm font-medium text-ktip-sand-800">
                2. Which features have you found most valuable? <span class="text-red-500">*</span>
              </p>
              <div class="grid grid-cols-2 gap-2">
                <For each={[...FEATURE_OPTIONS]}>
                  {(opt) => (
                    <label
                      class={cn(
                        'flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all',
                        q2().includes(opt.value)
                          ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                          : 'border-ktip-sand-200 hover:border-ktip-sand-300 hover:bg-ktip-sand-50'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={q2().includes(opt.value)}
                        onChange={() => toggleFeature(opt.value)}
                        class="w-4 h-4 rounded text-ktip-ocean-600 focus:ring-ktip-ocean-500"
                      />
                      <span class="text-sm font-medium">{opt.label}</span>
                    </label>
                  )}
                </For>
              </div>
              <Show when={errors().q2}>
                <p class="text-sm text-red-500">{errors().q2}</p>
              </Show>
            </div>

            {/* Q3 */}
            <div class="space-y-2">
              <p class="text-sm font-medium text-ktip-sand-800">
                3. Does the platform help you connect with other innovators across the OECS? <span class="text-red-500">*</span>
              </p>
              <RadioGroup name="q3" options={YES_SOMEWHAT_NO} value={q3()} onChange={setQ3} error={errors().q3} />
            </div>

            {/* Q4 */}
            <div class="space-y-2">
              <p class="text-sm font-medium text-ktip-sand-800">
                4. Does the platform help you discover funding or collaboration opportunities? <span class="text-red-500">*</span>
              </p>
              <RadioGroup name="q4" options={YES_SOMEWHAT_NO} value={q4()} onChange={setQ4} error={errors().q4} />
            </div>

            {/* Q5 */}
            <div class="space-y-2">
              <p class="text-sm font-medium text-ktip-sand-800">
                5. How likely are you to recommend this platform to a colleague? <span class="text-red-500">*</span>
              </p>
              <RatingScale value={q5()} onChange={setQ5} error={errors().q5} />
            </div>
          </div>
        </Show>

        {/* Step 2: User Experience */}
        <Show when={step() === 'experience'}>
          <div class="space-y-6">
            <div class="bg-ktip-tropical-50 rounded-xl px-4 py-3">
              <h3 class="font-display font-semibold text-ktip-tropical-700">User Experience</h3>
              <p class="text-xs text-ktip-tropical-600 mt-0.5">
                Help us understand how easy and pleasant the platform is to use.
              </p>
            </div>

            {/* Q6 */}
            <div class="space-y-2">
              <p class="text-sm font-medium text-ktip-sand-800">
                6. How easy is the platform to navigate? <span class="text-red-500">*</span>
              </p>
              <RadioGroup name="q6" options={NAVIGATION_OPTIONS} value={q6()} onChange={setQ6} error={errors().q6} />
            </div>

            {/* Q7 */}
            <div class="space-y-2">
              <p class="text-sm font-medium text-ktip-sand-800">
                7. Does the platform look professional and visually appealing? <span class="text-red-500">*</span>
              </p>
              <RadioGroup name="q7" options={YES_SOMEWHAT_NO} value={q7()} onChange={setQ7} error={errors().q7} />
            </div>

            {/* Q8 */}
            <div class="space-y-2">
              <p class="text-sm font-medium text-ktip-sand-800">
                8. How would you rate your overall experience? <span class="text-red-500">*</span>
              </p>
              <RadioGroup name="q8" options={EXPERIENCE_OPTIONS} value={q8()} onChange={setQ8} error={errors().q8} />
            </div>

            {/* Q9 */}
            <div class="space-y-2">
              <p class="text-sm font-medium text-ktip-sand-800">
                9. Did you encounter any issues or confusing areas? <span class="text-red-500">*</span>
              </p>
              <BooleanChoice name="q9" value={q9()} onChange={setQ9} error={errors().q9} />
              <Show when={q9() === true}>
                <Textarea
                  label="Please describe the issue"
                  value={q9Detail()}
                  onInput={(e) => setQ9Detail(e.currentTarget.value)}
                  rows={3}
                  placeholder="What happened and where..."
                />
              </Show>
            </div>

            {/* Q10 */}
            <div class="space-y-2">
              <p class="text-sm font-medium text-ktip-sand-800">
                10. How well does the platform perform (speed, loading times)? <span class="text-red-500">*</span>
              </p>
              <RadioGroup name="q10" options={PERFORMANCE_OPTIONS} value={q10()} onChange={setQ10} error={errors().q10} />
            </div>
          </div>
        </Show>

        {/* Step 3: Open Feedback */}
        <Show when={step() === 'open_feedback'}>
          <div class="space-y-6">
            <div class="bg-purple-50 rounded-xl px-4 py-3">
              <h3 class="font-display font-semibold text-purple-700">Open Feedback</h3>
              <p class="text-xs text-purple-600 mt-0.5">
                Share any additional thoughts to help us improve.
              </p>
            </div>

            {/* Q11 */}
            <Textarea
              label="11. What features or improvements would you like to see?"
              value={q11()}
              onInput={(e) => setQ11(e.currentTarget.value)}
              rows={4}
              placeholder="Describe any features, changes, or improvements you'd find valuable..."
            />

            {/* Q12 */}
            <Textarea
              label="12. Any other comments?"
              value={q12()}
              onInput={(e) => setQ12(e.currentTarget.value)}
              rows={4}
              placeholder="Share anything else on your mind..."
            />
          </div>
        </Show>

        {/* Navigation buttons */}
        <div class="flex items-center justify-between pt-4 border-t border-ktip-sand-100">
          <Show when={step() !== 'usefulness'} fallback={<div />}>
            <Button variant="ghost" size="sm" onClick={handleBack}>
              Back
            </Button>
          </Show>

          <Show
            when={step() !== 'open_feedback'}
            fallback={
              <Button size="sm" onClick={handleSubmit} loading={submitting()}>
                Submit Feedback
              </Button>
            }
          >
            <Button size="sm" onClick={handleNext}>
              Next
            </Button>
          </Show>
        </div>
      </div>
    </Modal>
  )
}
