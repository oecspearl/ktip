import { useId } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { ENTREPRENEUR_STAGES } from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import { entrepreneurStageDescription } from '../../lib/entrepreneur-stage'
import { cn } from '../../lib/utils'

interface EntrepreneurStageSelectProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  label?: string
  className?: string
}

/**
 * The entrepreneur's stage (profiles.entrepreneur_stage, 201), shown wherever
 * the Entrepreneur role is picked or edited: signup, onboarding and the profile
 * identity block.
 *
 * A native select, like IndustrySelect: form dropdowns stay native so they get
 * the platform's own picker on phones. The chosen stage's definition sits
 * underneath, because the four labels alone leave "Export-Ready or Exporter?"
 * to guesswork.
 */
export function EntrepreneurStageSelect({
  value,
  onChange,
  onBlur,
  error,
  label,
  className,
}: EntrepreneurStageSelectProps) {
  const { t, i18n } = useLingui()
  const id = useId()
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`
  const description = entrepreneurStageDescription(i18n, value)

  return (
    <div className={cn('flex flex-col gap-1.5 w-full', className)}>
      <label htmlFor={id} className="text-label font-medium text-ktip-sand-700">
        {label ?? t`Your stage as an entrepreneur`}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined
        }
        className={cn(
          'w-full border rounded-control px-4 py-3 min-h-control-md text-body bg-ktip-sand-50/50 transition-all',
          'focus:outline-hidden focus:ring-2 focus:bg-ktip-cream',
          error
            ? 'border-red-400/70 bg-red-50/30 focus:border-red-400 focus:ring-red-400/15'
            : 'border-ktip-sand-200 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20',
        )}
      >
        <option value="">
          <Trans>Choose a stage</Trans>
        </option>
        {ENTREPRENEUR_STAGES.map((stage) => (
          <option key={stage.value} value={stage.value}>
            {resolveCopy(i18n, stage.label)}
          </option>
        ))}
      </select>
      {description && (
        <p id={descriptionId} className="text-caption text-ktip-sand-500">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-caption text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
