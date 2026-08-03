import { Fragment, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

interface UATFeedbackFormProps {
  open: boolean
  onClose: () => void
}

type Step = 'usefulness' | 'experience' | 'open_feedback'

const USEFULNESS_OPTIONS = [
  { value: 'very_useful', label: msg`Very useful` },
  { value: 'somewhat', label: msg`Somewhat useful` },
  { value: 'not_very', label: msg`Not very useful` },
  { value: 'not_at_all', label: msg`Not at all useful` },
] as const

const FEATURE_OPTIONS = [
  { value: 'projects', label: msg`Projects` },
  { value: 'events', label: msg`Events` },
  { value: 'grants', label: msg`Grants` },
  { value: 'forums', label: msg`Forums` },
  { value: 'collaboration', label: msg`Collaboration Tools` },
  { value: 'directory', label: msg`Member Directory` },
  { value: 'resources', label: msg`Resources` },
] as const

const YES_SOMEWHAT_NO = [
  { value: 'yes', label: msg`Yes` },
  { value: 'somewhat', label: msg`Somewhat` },
  { value: 'no', label: msg`No` },
] as const

const NAVIGATION_OPTIONS = [
  { value: 'very_easy', label: msg`Very easy` },
  { value: 'easy', label: msg`Easy` },
  { value: 'neutral', label: msg`Neutral` },
  { value: 'difficult', label: msg`Difficult` },
  { value: 'very_difficult', label: msg`Very difficult` },
] as const

const EXPERIENCE_OPTIONS = [
  { value: 'excellent', label: msg`Excellent` },
  { value: 'good', label: msg`Good` },
  { value: 'average', label: msg`Average` },
  { value: 'poor', label: msg`Poor` },
  { value: 'very_poor', label: msg`Very poor` },
] as const

const PERFORMANCE_OPTIONS = [
  { value: 'fast', label: msg`Fast` },
  { value: 'acceptable', label: msg`Acceptable` },
  { value: 'slow', label: msg`Slow` },
] as const

function RadioGroup(groupProps: {
  name: string
  options: readonly { value: string; label: MessageDescriptor }[]
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const { i18n } = useLingui()
  return (
    <div className="space-y-2">
      {groupProps.options.map((opt) => (
        <label
          key={opt.value}
          className={cn(
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
            className="w-4 h-4 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
          />
          <span className="text-sm font-medium">{i18n._(opt.label)}</span>
        </label>
      ))}
      {groupProps.error && <p className="text-sm text-red-500">{groupProps.error}</p>}
    </div>
  )
}

function BooleanChoice(boolProps: {
  name: string
  value: boolean | null
  onChange: (v: boolean) => void
  error?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <label
          className={cn(
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
            className="w-4 h-4 text-ktip-ocean-600"
          />
          <span className="text-sm font-medium"><Trans>Yes</Trans></span>
        </label>
        <label
          className={cn(
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
            className="w-4 h-4 text-ktip-ocean-600"
          />
          <span className="text-sm font-medium"><Trans>No</Trans></span>
        </label>
      </div>
      {boolProps.error && <p className="text-sm text-red-500">{boolProps.error}</p>}
    </div>
  )
}

function RatingScale(ratingProps: {
  value: number | null
  onChange: (v: number) => void
  error?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => ratingProps.onChange(n)}
            className={cn(
              'w-12 h-12 rounded-xl border-2 font-bold text-lg transition-all',
              ratingProps.value === n
                ? 'border-ktip-ocean-500 bg-ktip-ocean-500 dark:bg-ktip-ocean-200 text-white scale-110'
                : 'border-ktip-sand-200 hover:border-ktip-ocean-300 text-ktip-sand-600 hover:bg-ktip-ocean-50'
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-ktip-sand-500 px-1">
        <span><Trans>Not likely</Trans></span>
        <span><Trans>Very likely</Trans></span>
      </div>
      {ratingProps.error && <p className="text-sm text-red-500">{ratingProps.error}</p>}
    </div>
  )
}

export function UATFeedbackForm({ open, onClose }: UATFeedbackFormProps) {
    const { t, i18n } = useLingui()
  const toast = useToast()

  const [step, setStep] = useState<Step>('usefulness')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Section 1: Usefulness & Value
  const [q1, setQ1] = useState('')
  const [q2, setQ2] = useState<string[]>([])
  const [q3, setQ3] = useState('')
  const [q4, setQ4] = useState('')
  const [q5, setQ5] = useState<number | null>(null)

  // Section 2: User Experience
  const [q6, setQ6] = useState('')
  const [q7, setQ7] = useState('')
  const [q8, setQ8] = useState('')
  const [q9, setQ9] = useState<boolean | null>(null)
  const [q9Detail, setQ9Detail] = useState('')
  const [q10, setQ10] = useState('')

  // Section 3: Open Feedback
  const [q11, setQ11] = useState('')
  const [q12, setQ12] = useState('')

  const toggleFeature = (value: string) => {
    setQ2((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  const validateUsefulness = () => {
    const errs: Record<string, string> = {}
    if (!q1) errs.q1 = t`Required`
    if (q2.length === 0) errs.q2 = t`Select at least one feature`
    if (!q3) errs.q3 = t`Required`
    if (!q4) errs.q4 = t`Required`
    if (q5 === null) errs.q5 = t`Required`
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validateExperience = () => {
    const errs: Record<string, string> = {}
    if (!q6) errs.q6 = t`Required`
    if (!q7) errs.q7 = t`Required`
    if (!q8) errs.q8 = t`Required`
    if (q9 === null) errs.q9 = t`Required`
    if (!q10) errs.q10 = t`Required`
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = () => {
    if (step === 'usefulness') {
      if (validateUsefulness()) {
        setStep('experience')
        setErrors({})
      }
    } else if (step === 'experience') {
      if (validateExperience()) {
        setStep('open_feedback')
        setErrors({})
      }
    }
  }

  const handleBack = () => {
    if (step === 'experience') setStep('usefulness')
    if (step === 'open_feedback') setStep('experience')
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const { error } = await supabase.from('uat_responses' as any).insert({
        q1_usefulness: q1,
        q2_valuable_features: q2,
        q3_connect_innovators: q3,
        q4_discover_opportunities: q4,
        q5_recommend_rating: q5,
        q6_ease_of_navigation: q6,
        q7_professional: q7,
        q8_overall_experience: q8,
        q9_issues: q9,
        q9_issues_detail: q9Detail || null,
        q10_performance: q10,
        q11_improvements: q11 || null,
        q12_comments: q12 || null,
      } as any)

      if (error) throw error

      toast.success(t`Thank you for your feedback!`)
      localStorage.setItem('ktip_uat_submitted', 'true')
      localStorage.setItem('ktip_uat_submitted_at', new Date().toISOString())
      onClose()
    } catch (err: any) {
      toast.error(err.message || t`Failed to submit feedback`)
    } finally {
      setSubmitting(false)
    }
  }

  const steps: { key: Step; label: string }[] = [
    { key: 'usefulness', label: t`Usefulness` },
    { key: 'experience', label: t`Experience` },
    { key: 'open_feedback', label: t`Feedback` },
  ]
  const currentIdx = steps.findIndex((s) => s.key === step)

  const stepIndicator = () => (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((_s, idx) => (
        <Fragment key={_s.key}>
          {idx > 0 && (
            <div className={cn('flex-1 h-0.5', idx <= currentIdx ? 'bg-ktip-ocean-500' : 'bg-ktip-sand-200')} />
          )}
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all',
              idx < currentIdx
                ? 'bg-ktip-ocean-500 dark:bg-ktip-ocean-200 text-white'
                : idx === currentIdx
                  ? 'bg-ktip-ocean-500 dark:bg-ktip-ocean-200 text-white ring-4 ring-ktip-ocean-100'
                  : 'bg-ktip-sand-100 text-ktip-sand-500'
            )}
          >
            {idx + 1}
          </div>
        </Fragment>
      ))}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t`Platform Feedback`}
      description={t`Help us improve KTIP. Your responses are anonymous and only take a few minutes.`}
      size="xl"
    >
      <div className="space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <img
            src="/ktip-logo-128.webp"
            alt=""
            loading="lazy" decoding="async" width={64} height={64} className="w-16 h-16 rounded-full object-cover"
          />
        </div>

        {stepIndicator()}

        {/* Step 1: Usefulness & Value */}
        {step === 'usefulness' && (
          <div className="space-y-6">
            <div className="bg-ktip-ocean-50 rounded-xl px-4 py-3">
              <h3 className="font-display font-semibold text-ktip-ocean-700"><Trans>Usefulness & Value</Trans></h3>
              <p className="text-xs text-ktip-ocean-600 mt-0.5">
                <Trans>Help us understand how valuable the platform is for your work.</Trans>
              </p>
            </div>

            {/* Q1 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-ktip-sand-800">
                <Trans>1. How useful is this platform for your work or interests?</Trans> <span className="text-red-500">*</span>
              </p>
              <RadioGroup name="q1" options={USEFULNESS_OPTIONS} value={q1} onChange={setQ1} error={errors.q1} />
            </div>

            {/* Q2 - Multi-select */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-ktip-sand-800">
                <Trans>2. Which features have you found most valuable?</Trans> <span className="text-red-500">*</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {FEATURE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all',
                      q2.includes(opt.value)
                        ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                        : 'border-ktip-sand-200 hover:border-ktip-sand-300 hover:bg-ktip-sand-50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={q2.includes(opt.value)}
                      onChange={() => toggleFeature(opt.value)}
                      className="w-4 h-4 rounded text-ktip-ocean-600 focus:ring-ktip-ocean-500"
                    />
                    <span className="text-sm font-medium">{i18n._(opt.label)}</span>
                  </label>
                ))}
              </div>
              {errors.q2 && <p className="text-sm text-red-500">{errors.q2}</p>}
            </div>

            {/* Q3 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-ktip-sand-800">
                <Trans>3. Does the platform help you connect with other innovators across the OECS?</Trans> <span className="text-red-500">*</span>
              </p>
              <RadioGroup name="q3" options={YES_SOMEWHAT_NO} value={q3} onChange={setQ3} error={errors.q3} />
            </div>

            {/* Q4 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-ktip-sand-800">
                <Trans>4. Does the platform help you discover funding or collaboration opportunities?</Trans> <span className="text-red-500">*</span>
              </p>
              <RadioGroup name="q4" options={YES_SOMEWHAT_NO} value={q4} onChange={setQ4} error={errors.q4} />
            </div>

            {/* Q5 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-ktip-sand-800">
                <Trans>5. How likely are you to recommend this platform to a colleague?</Trans> <span className="text-red-500">*</span>
              </p>
              <RatingScale value={q5} onChange={setQ5} error={errors.q5} />
            </div>
          </div>
        )}

        {/* Step 2: User Experience */}
        {step === 'experience' && (
          <div className="space-y-6">
            <div className="bg-ktip-tropical-50 rounded-xl px-4 py-3">
              <h3 className="font-display font-semibold text-ktip-tropical-700"><Trans>User Experience</Trans></h3>
              <p className="text-xs text-ktip-tropical-600 mt-0.5">
                <Trans>Help us understand how easy and pleasant the platform is to use.</Trans>
              </p>
            </div>

            {/* Q6 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-ktip-sand-800">
                <Trans>6. How easy is the platform to navigate?</Trans> <span className="text-red-500">*</span>
              </p>
              <RadioGroup name="q6" options={NAVIGATION_OPTIONS} value={q6} onChange={setQ6} error={errors.q6} />
            </div>

            {/* Q7 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-ktip-sand-800">
                <Trans>7. Does the platform look professional and visually appealing?</Trans> <span className="text-red-500">*</span>
              </p>
              <RadioGroup name="q7" options={YES_SOMEWHAT_NO} value={q7} onChange={setQ7} error={errors.q7} />
            </div>

            {/* Q8 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-ktip-sand-800">
                <Trans>8. How would you rate your overall experience?</Trans> <span className="text-red-500">*</span>
              </p>
              <RadioGroup name="q8" options={EXPERIENCE_OPTIONS} value={q8} onChange={setQ8} error={errors.q8} />
            </div>

            {/* Q9 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-ktip-sand-800">
                <Trans>9. Did you encounter any issues or confusing areas?</Trans> <span className="text-red-500">*</span>
              </p>
              <BooleanChoice name="q9" value={q9} onChange={setQ9} error={errors.q9} />
              {q9 === true && (
                <Textarea
                  label={t`Please describe the issue`}
                  value={q9Detail}
                  onChange={(e) => setQ9Detail(e.currentTarget.value)}
                  rows={3}
                  placeholder={t`What happened and where...`}
                />
              )}
            </div>

            {/* Q10 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-ktip-sand-800">
                <Trans>10. How well does the platform perform (speed, loading times)?</Trans> <span className="text-red-500">*</span>
              </p>
              <RadioGroup name="q10" options={PERFORMANCE_OPTIONS} value={q10} onChange={setQ10} error={errors.q10} />
            </div>
          </div>
        )}

        {/* Step 3: Open Feedback */}
        {step === 'open_feedback' && (
          <div className="space-y-6">
            <div className="bg-ktip-ocean-50 rounded-xl px-4 py-3">
              <h3 className="font-display font-semibold text-ktip-ocean-700"><Trans>Open Feedback</Trans></h3>
              <p className="text-xs text-ktip-ocean-600 mt-0.5">
                <Trans>Share any additional thoughts to help us improve.</Trans>
              </p>
            </div>

            {/* Q11 */}
            <Textarea
              label={t`11. What features or improvements would you like to see?`}
              value={q11}
              onChange={(e) => setQ11(e.currentTarget.value)}
              rows={4}
              placeholder={t`Describe any features, changes, or improvements you'd find valuable...`}
            />

            {/* Q12 */}
            <Textarea
              label={t`12. Any other comments?`}
              value={q12}
              onChange={(e) => setQ12(e.currentTarget.value)}
              rows={4}
              placeholder={t`Share anything else on your mind...`}
            />
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-ktip-sand-100">
          {step !== 'usefulness' ? (
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <Trans>Back</Trans>
            </Button>
          ) : (
            <div />
          )}

          {step !== 'open_feedback' ? (
            <Button size="sm" onClick={handleNext}>
              <Trans>Next</Trans>
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} loading={submitting}>
              <Trans>Submit Feedback</Trans>
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
