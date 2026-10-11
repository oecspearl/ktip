import { Link } from 'react-router'
import { Sparkles } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Badge } from '../ui/Badge'
import { cn } from '../../lib/utils'
import { legalPath } from '../../lib/legal/manifest'
import type { AiUse } from '../../types'

/**
 * The AI declaration a member makes at upload, and the label it becomes.
 *
 * The AI Use Disclosure (version 2) asks for two things: say so when AI tools
 * materially helped, and say so when AI wrote the full first draft. Two
 * checkboxes, the second only reachable through the first, map onto the one
 * three-valued column 170 added, so the form cannot produce "drafted but not
 * assisted".
 */
export function AiDeclarationField({
  value,
  onChange,
  disabled,
}: {
  value: AiUse
  onChange: (next: AiUse) => void
  disabled?: boolean
}) {
  const assisted = value !== 'none'

  return (
    <fieldset className="rounded-xl border border-ktip-sand-200 bg-white p-4">
      <legend className="px-1 text-label font-medium text-ktip-sand-700">
        <Trans>AI declaration</Trans>
      </legend>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={assisted}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? 'assisted' : 'none')}
          className="mt-0.5 h-4 w-4 rounded border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
        />
        <span className="text-body text-ktip-sand-800">
          <Trans>AI tools materially helped create this</Trans>
        </span>
      </label>

      {assisted && (
        <label className="mt-3 ml-7 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={value === 'drafted'}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? 'drafted' : 'assisted')}
            className="mt-0.5 h-4 w-4 rounded border-ktip-sand-300 text-ktip-ocean-600 focus:ring-ktip-ocean-500"
          />
          <span className="text-body text-ktip-sand-800">
            <Trans>AI wrote the full first draft</Trans>
          </span>
        </label>
      )}

      <p className="mt-3 text-caption leading-relaxed text-ktip-sand-500">
        <Trans>
          Fixing spelling or grammar doesn't count. Your answer is shown as a label on the
          resource.
        </Trans>{' '}
        <Link
          to={legalPath('ai-disclosure') + '#your-responsibilities'}
          className="font-semibold text-ktip-ocean-700 hover:underline underline-offset-2"
        >
          <Trans>AI Use Disclosure</Trans>
        </Link>
      </p>
    </fieldset>
  )
}

/** The label a reader sees. Renders nothing for 'none' or a row read before 170. */
export function AiUseBadge({
  value,
  size = 'md',
  className,
}: {
  value: AiUse | null | undefined
  size?: 'sm' | 'md'
  className?: string
}) {
  const { t } = useLingui()
  if (value !== 'assisted' && value !== 'drafted') return null

  const label = value === 'drafted' ? t`AI-drafted` : t`AI-assisted`
  const detail =
    value === 'drafted'
      ? t`The author declared that AI wrote the full first draft.`
      : t`The author declared that AI tools materially helped create this.`

  return (
    <Badge
      size={size}
      title={detail}
      className={cn('bg-ktip-sun-50 text-ktip-sun-800 border-ktip-sun-200', className)}
    >
      <Sparkles size={size === 'sm' ? 11 : 13} aria-hidden />
      {label}
      <span className="sr-only">. {detail}</span>
    </Badge>
  )
}
