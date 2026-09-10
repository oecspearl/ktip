import { Sparkles } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import type { MatchReason } from '../../types'
import { reasonLabel } from '../../lib/personalization'

interface MatchReasonChipProps {
  reasons: MatchReason[] | undefined
  className?: string
  /** Show every reason as a list rather than one chip with a "+N". */
  expanded?: boolean
  /** Just the sparkle, every reason in the tooltip — for cards with no spare line. */
  iconOnly?: boolean
}

/**
 * "Why this matched", shown on a ranked card.
 *
 * Only the strongest reason gets the chip — the rest sit in the tooltip. The
 * ranker returns reasons already sorted by weight and already filtered to
 * positive contributions, so this component never has to know the formula.
 * Wording comes from the catalogue via reasonLabel(): the ranker sends a code
 * and parameters, never English. Renders nothing when the list was not
 * fetched under "For You", which is what keeps the cards unchanged for
 * everyone else.
 */
export function MatchReasonChip({ reasons, className = '', expanded = false, iconOnly = false }: MatchReasonChipProps) {
  const { i18n, t } = useLingui()
  if (!reasons?.length) return null

  const labels = reasons.map((r) => reasonLabel(i18n, r))

  if (iconOnly) {
    return (
      <span
        title={labels.join('\n')}
        aria-label={t`Why this is recommended: ${labels.join('; ')}`}
        className={`inline-flex shrink-0 items-center text-ktip-ocean-500 ${className}`}
      >
        <Sparkles size={12} />
      </span>
    )
  }

  if (expanded) {
    return (
      <ul className={`flex flex-col gap-1 text-xs text-ktip-sand-600 ${className}`}>
        {labels.map((label, i) => (
          <li key={`${reasons[i].code}-${i}`} className="flex items-center gap-1.5">
            <Sparkles size={11} className="shrink-0 text-ktip-ocean-500" />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    )
  }

  const [top, ...rest] = labels

  return (
    <span
      title={labels.join('\n')}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-ktip-ocean-50 text-ktip-ocean-700 border border-ktip-ocean-200 max-w-full ${className}`}
    >
      <Sparkles size={11} className="shrink-0" />
      <span className="truncate">{top}</span>
      {rest.length > 0 && <span className="text-ktip-ocean-400 shrink-0">+{rest.length}</span>}
    </span>
  )
}
