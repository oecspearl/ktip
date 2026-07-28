import { Link } from 'react-router'
import { Check, X } from 'lucide-react'
import { cn, formatDate } from '../../lib/utils'
import type { TimelineItem } from '../../lib/timeline'
import { Badge } from '../ui/Badge'
import {
  GRANT_APPLICATION_STATUS_COLORS,
  GRANT_APPLICATION_STATUS_LABELS,
  PHASE_COLORS,
  PHASE_LABELS,
} from '../../lib/constants'

interface TimelineItemDetailProps {
  item: TimelineItem
}

export function TimelineItemDetail({ item }: TimelineItemDetailProps) {
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
            {isGrant ? 'Grant Application' : 'Project'}
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

      {/* Stepper */}
      <div className="flex items-center w-full overflow-x-auto pb-2">
        {item.stages.map((stage, i) => {
          const isCompleted = i < item.currentIndex || (i === item.currentIndex && item.isTerminal)
          const isCurrent = i === item.currentIndex && !item.isTerminal
          const isRejectedStep = item.isRejected && i === item.stages.length - 1 && item.isTerminal

          return (
            <div
              key={stage.key}
              className={cn('flex items-center flex-shrink-0', i < item.stages.length - 1 && 'flex-1')}
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all',
                    isRejectedStep && 'bg-red-500 border-red-500 text-white',
                    !isRejectedStep && isCompleted && 'bg-ktip-ocean-500 border-ktip-ocean-500 text-white',
                    !isRejectedStep && isCurrent && 'bg-ktip-ocean-500 border-ktip-ocean-500 text-white ring-4 ring-ktip-ocean-100',
                    !isRejectedStep && !isCompleted && !isCurrent && 'bg-ktip-cream border-ktip-sand-300 text-ktip-sand-400'
                  )}
                >
                  {isRejectedStep ? <X size={16} /> : isCompleted ? <Check size={16} /> : i + 1}
                </div>
                <span
                  className={cn(
                    'text-xs font-medium text-center whitespace-nowrap max-w-[90px] truncate',
                    isRejectedStep
                      ? 'text-red-600'
                      : isCompleted || isCurrent
                        ? 'text-ktip-ocean-600'
                        : 'text-ktip-sand-400'
                  )}
                >
                  {stage.label}
                </span>
                <span className="text-[10px] text-ktip-sand-400 whitespace-nowrap">
                  {stage.reachedAt ? formatDate(stage.reachedAt, 'PP') : '—'}
                </span>
              </div>

              {i < item.stages.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 min-w-[20px] transition-colors self-start mt-4',
                    i < item.currentIndex ? 'bg-ktip-ocean-500' : 'bg-ktip-sand-200'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-ktip-sand-100 text-sm text-ktip-sand-500">
        <span>Started {formatDate(item.startAt, 'PP')}</span>
        {item.isTerminal && item.endAt && (
          <span>
            {isGrant ? 'Decided' : 'Launched'} {formatDate(item.endAt, 'PP')}
          </span>
        )}
      </div>
    </div>
  )
}
