import { GRANT_APPLICATION_STATUS_LABELS } from '../../../lib/constants'
import { Trans } from '@lingui/react/macro'

interface PipelineDonutProps {
  data: { label: string; count: number }[]
}

/**
 * Declared order, not the order rows came back in — a pipeline that reads
 * draft → decided is a pipeline; alphabetical is a list.
 */
const STATUS_ORDER = ['draft', 'pending', 'under_review', 'approved', 'rejected']

/**
 * Arc colours as text utilities rather than stroke-*, so the SVG picks them up
 * through currentColor and the tokens resolve the same way they do everywhere
 * else in the app.
 */
const STATUS_TONE: Record<string, string> = {
  draft: 'text-ktip-sand-300',
  pending: 'text-ktip-sun-400',
  under_review: 'text-ktip-ocean-500',
  approved: 'text-ktip-tropical-500',
  rejected: 'text-red-400',
}

const R = 42
const CIRCUMFERENCE = 2 * Math.PI * R

export function PipelineDonut({ data }: PipelineDonutProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0)

  if (!total) {
    return (
      <p className="text-sm italic text-ktip-sand-500">
        <Trans>No applications yet — the pipeline fills in as you apply.</Trans>
      </p>
    )
  }

  const ordered = [...data].sort(
    (a, b) => STATUS_ORDER.indexOf(a.label) - STATUS_ORDER.indexOf(b.label)
  )

  // Running offset: each arc starts where the previous one ended
  let consumed = 0
  const arcs = ordered.map((item) => {
    const length = (item.count / total) * CIRCUMFERENCE
    const arc = { ...item, length, offset: consumed }
    consumed += length
    return arc
  })

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90" role="img">
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth="12"
          className="text-ktip-sand-100"
          stroke="currentColor"
        />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="12"
            // A 1px gap between neighbouring arcs so two similar tones still
            // read as two segments
            strokeDasharray={`${Math.max(0, arc.length - 1)} ${CIRCUMFERENCE}`}
            strokeDashoffset={-arc.offset}
            className={STATUS_TONE[arc.label] || 'text-ktip-sand-400'}
            stroke="currentColor"
          >
            <title>{`${GRANT_APPLICATION_STATUS_LABELS[arc.label] || arc.label}: ${arc.count}`}</title>
          </circle>
        ))}
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {arcs.map((arc) => (
          <li className="flex items-center gap-2 text-sm" key={arc.label}>
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-full bg-current ${
                STATUS_TONE[arc.label] || 'text-ktip-sand-400'
              }`}
            />
            <span className="truncate text-ktip-sand-700">
              {GRANT_APPLICATION_STATUS_LABELS[arc.label] || arc.label.replace(/_/g, ' ')}
            </span>
            <span className="ml-auto shrink-0 font-medium tabular-nums text-ktip-sand-500">
              {arc.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
