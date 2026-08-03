import { type EventCriterion } from '../../types'
import { groupCriteria } from '../../hooks/useEventCriteria'
import {
  EVENT_CRITERION_GROUP_LABELS,
  EVENT_CRITERION_GROUP_HINTS,
} from '../../lib/constants'
import { Target, Ban, Package, Scale, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { Trans, useLingui } from '@lingui/react/macro'

interface EventChallengeBriefProps {
  criteria: EventCriterion[]
  submissionDeadline?: string | null
}

const GROUP_ICONS = {
  objective: Target,
  constraint: Ban,
  deliverable: Package,
  judging_criterion: Scale,
} as const

export function EventChallengeBrief({ criteria, submissionDeadline }: EventChallengeBriefProps) {
  const { t } = useLingui()
  const groups = groupCriteria(criteria)
  if (!groups.length) return null

  // Weights are authored as bare numbers (30, 20, 1.5). Percentages only make
  // sense once every criterion carries one, so it's all or nothing.
  const judging = groups.find((g) => g.kind === 'judging_criterion')?.items || []
  const weightTotal = judging.reduce((sum, item) => sum + (item.weight ?? 0), 0)
  const showPercent = judging.length > 0 && judging.every((i) => i.weight != null) && weightTotal > 0

  const deadlinePassed = submissionDeadline
    ? new Date(submissionDeadline).getTime() < Date.now()
    : false

  return (
    <div className="bg-ktip-cream rounded-xl border border-ktip-sand-200 shadow-card p-6 mt-10">
      <h2 className="text-xl font-display font-bold text-ktip-sand-900 mb-1 flex items-center gap-2">
        <Target className="text-ktip-ocean-600" size={20} />
        <Trans>The Challenge</Trans>
      </h2>
      <p className="text-ktip-ocean-600 text-xs italic mb-4">
        <Trans>What participants are asked to accomplish</Trans>
      </p>

      {submissionDeadline && (
        <div
          className={
            'flex items-center gap-2 text-sm rounded-xl px-4 py-3 mb-6 border ' +
            (deadlinePassed
              ? 'bg-ktip-sand-100 text-ktip-sand-600 border-ktip-sand-200'
              : 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200')
          }
        >
          <Clock size={16} className="flex-shrink-0" />
          <span>
            {deadlinePassed ? t`Submissions closed ` : t`Submissions close `}
            {format(new Date(submissionDeadline), 'MMM d, yyyy · h:mm a')}
          </span>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => {
          const Icon = GROUP_ICONS[group.kind]
          return (
            <div key={group.kind}>
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider flex items-center gap-2">
                <Icon size={16} className="text-ktip-ocean-600" />
                {EVENT_CRITERION_GROUP_LABELS[group.kind]}
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-3">
                {EVENT_CRITERION_GROUP_HINTS[group.kind]}
              </p>

              <ul className="space-y-3">
                {group.items.map((item, index) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ktip-ocean-100 text-ktip-ocean-700 text-xs font-semibold flex items-center justify-center mt-0.5">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-ktip-sand-900">{item.title}</span>
                        {group.kind === 'judging_criterion'
                          ? item.weight != null && (
                              <span className="text-xs text-ktip-sand-500">
                                {showPercent
                                  ? `${Math.round((item.weight / weightTotal) * 100)}%`
                                  : t`weight ${item.weight}`}
                              </span>
                            )
                          : !item.is_required && (
                              <span className="text-xs text-ktip-sand-500"><Trans>optional</Trans></span>
                            )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-ktip-sand-600 mt-0.5 whitespace-pre-wrap">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
