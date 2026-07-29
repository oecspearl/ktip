import { Sparkles } from 'lucide-react'
import type { MatchReason } from '../../types'

interface MatchReasonChipProps {
  reasons: MatchReason[] | undefined
  className?: string
}

/**
 * "Why this matched", shown on a ranked card.
 *
 * Only the strongest reason gets the chip — the rest sit in the tooltip. The
 * ranker returns reasons already sorted by weight and already filtered to
 * positive contributions, so this component never has to know the formula.
 * Renders nothing when the list was not fetched under "For You", which is
 * what keeps the cards unchanged for everyone else.
 */
export function MatchReasonChip({ reasons, className = '' }: MatchReasonChipProps) {
  if (!reasons?.length) return null

  const [top, ...rest] = reasons
  const title = rest.length
    ? [top.label, ...rest.map((r) => r.label)].join('\n')
    : top.label

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-ktip-ocean-50 text-ktip-ocean-700 border border-ktip-ocean-200 max-w-full ${className}`}
    >
      <Sparkles size={11} className="shrink-0" />
      <span className="truncate">{top.label}</span>
      {rest.length > 0 && <span className="text-ktip-ocean-400 shrink-0">+{rest.length}</span>}
    </span>
  )
}
