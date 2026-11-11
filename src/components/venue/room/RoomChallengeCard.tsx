import { Trans, useLingui } from '@lingui/react/macro'
import { useEventCriteria } from '../../../hooks/useEventCriteria'
import { useTranslatedList } from '../../../hooks/useTranslated'
import { RoomPanel } from './RoomPanel'
import type { Event } from '../../../types'

/**
 * The challenge, the way a room shows it: the one sentence everybody is
 * building towards, then what the judges weigh and by how much.
 *
 * The event page has the long brief with constraints and deliverables; a room
 * needs the short one. Renders nothing for an event with no criteria.
 */
export function RoomChallengeCard({ event }: { event: Event }) {
  const { t } = useLingui()
  const { criteria } = useEventCriteria(event.id)
  const rows = useTranslatedList(
    (criteria ?? []).map((c) => ({ id: c.id, kind: c.kind, title: c.title, weight: c.weight ?? null })),
    ['title']
  )
  const objectives = rows.filter((c) => c.kind === 'objective')
  const judging = rows.filter((c) => c.kind === 'judging_criterion')
  if (!objectives.length && !judging.length) return null

  const total = judging.reduce((sum, c) => sum + (c.weight ?? 0), 0)
  const weighted = judging.length > 0 && total > 0 && judging.every((c) => c.weight != null)
  const [headline, ...more] = objectives

  return (
    <RoomPanel title={t`The challenge`}>
      <div className="flex flex-col gap-4 p-4">
        {headline && (
          <p className="text-balance font-display text-2xl font-bold leading-tight text-ktip-sand-900">{headline.title}</p>
        )}
        {more.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-ktip-sand-700">
            {more.map((c) => (
              <li key={c.id} className="break-words">
                {c.title}
              </li>
            ))}
          </ul>
        )}
        {judging.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <span className="sr-only">
              <Trans>What the judges weigh</Trans>
            </span>
            {judging.map((c) => {
              const percent = weighted ? Math.round(((c.weight ?? 0) / total) * 100) : null
              return (
                <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                  <span className="break-words font-medium text-ktip-sand-800">{c.title}</span>
                  {percent !== null && <span className="font-bold tabular-nums text-ktip-sand-900">{percent}%</span>}
                  {percent !== null && (
                    <span className="col-span-2 block h-1.5 overflow-hidden rounded-full bg-ktip-sand-100" aria-hidden="true">
                      {/* Scaled so a 40% weight fills the bar and small ones stay readable. */}
                      <span className="block h-full rounded-full bg-ktip-ocean-600" style={{ width: `${Math.min(100, percent * 2.5)}%` }} />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </RoomPanel>
  )
}
