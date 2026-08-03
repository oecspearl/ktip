import { Link } from 'react-router'
import { cn, formatDate } from '../../lib/utils'
import type { TimelineItem } from '../../lib/timeline'
import { Badge } from '../ui/Badge'
import { Stepper } from '../ui/Stepper'
import {
  GRANT_APPLICATION_STATUS_COLORS,
  GRANT_APPLICATION_STATUS_LABELS,
  PHASE_COLORS,
  PHASE_LABELS,
} from '../../lib/constants'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'

interface TimelineItemDetailProps {
  item: TimelineItem
}

export function TimelineItemDetail({ item }: TimelineItemDetailProps) {
    const { t, i18n } = useLingui()
  const isGrant = item.kind === 'grant_application'
  const statusLabel = isGrant
    ? (GRANT_APPLICATION_STATUS_LABELS[item.currentKey] ?? item.currentKey)
    : (PHASE_LABELS[item.currentKey] ?? item.currentKey)
  const statusColor = isGrant
    ? GRANT_APPLICATION_STATUS_COLORS[item.currentKey]
    : PHASE_COLORS[item.currentKey]

  return (
    <div className="bg-ktip-cream border border-ktip-sand-100 rounded-2xl shadow-card p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ktip-sand-500 mb-1">
            {isGrant ? t`Grant Application` : t`Project`}
          </p>
          <Link
            to={item.href}
            className="font-display font-bold text-lg text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors line-clamp-2"
          >
            {item.title}
          </Link>
        </div>
        <Badge size="sm" className={cn('shrink-0', statusColor)}>
          {statusLabel}
        </Badge>
      </div>

      {/* A decided application sits on its last stage, so `isTerminal` retires
          the current step instead of leaving it reading as in-progress. */}
      <Stepper
        className="mb-2"
        steps={item.stages.map((stage) => ({
          label: resolveCopy(i18n, stage.label),
          sublabel: stage.reachedAt ? formatDate(stage.reachedAt, 'PP') : '—',
        }))}
        currentStep={item.currentIndex}
        terminal={
          item.isTerminal ? (item.isRejected ? 'rejected' : 'complete') : undefined
        }
      />

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-ktip-sand-100 text-sm text-ktip-sand-500">
        <span>
          <Trans>Started {formatDate(item.startAt, 'PP')}</Trans>
        </span>
        {item.isTerminal && item.endAt && (
          <span>
            {isGrant ? (
              <Trans>Decided {formatDate(item.endAt, 'PP')}</Trans>
            ) : (
              <Trans>Launched {formatDate(item.endAt, 'PP')}</Trans>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
