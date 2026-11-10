import { Suspense, lazy, useState } from 'react'
import { Coffee, Eye, LogOut } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../ui/Button'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import { useCoffeeTables } from '../../../hooks/useCoffeeTables'
import { isVenueVideoConfigured, useCoffeeTableToken } from '../../../hooks/useVenueRoomToken'
import { minutesLeft, type CoffeeTable } from '../../../lib/coffee-tables'
import { useNow } from './judging/judging-time'
import { CallErrorBoundary } from '../../CallErrorBoundary'
import type { VenueRoom } from '../../../types'

// Lazy for the same reason as in AvStage: the LiveKit SDK loads only once
// somebody actually sits down.
const VenueCall = lazy(() => import('./VenueCall').then((m) => ({ default: m.VenueCall })))

/**
 * Coffee tables (migration 200). Ten minutes of video with three or four people
 * from other teams. Never one-to-one, every table listed here for the whole
 * room, and organisers can drop in to any of them.
 */
export function CoffeeTablesPanel({ room }: { room: VenueRoom }) {
  const { t } = useLingui()
  const toast = useToast()
  const now = useNow(15_000)
  const { state, loading, error, join, leave } = useCoffeeTables(room.id)
  // An organiser looking in on a table they are not seated at.
  const [visiting, setVisiting] = useState<string | null>(null)

  const myTable = state.tables.find((x) => x.id === state.myTableId) ?? null
  const callTableId = myTable?.id ?? (state.isHost ? visiting : null)
  const callTable = state.tables.find((x) => x.id === callTableId) ?? null

  const onJoin = () =>
    join.mutate(undefined, { onError: (err: any) => toast.error(err?.message || t`Could not join the queue`) })
  const onLeave = () => {
    if (visiting && !myTable) {
      setVisiting(null)
      return
    }
    leave.mutate(undefined, { onError: (err: any) => toast.error(err?.message || t`Could not leave`) })
  }

  const tableNumber = new Map(state.tables.map((table, i) => [table.id, i + 1]))
  const tableCount = state.tables.length

  return (
    // The revamp's "tool" card: the room's one job, under the call.
    <section
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-surface border border-ktip-sand-100 bg-ktip-cream shadow-card"
      aria-label={t`Coffee tables`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ktip-sand-100 px-4 py-3">
        <Coffee size={20} className="shrink-0 text-ktip-sun-700" aria-hidden="true" />
        <h3 className="text-sm font-extrabold text-ktip-sand-900">
          <Trans>Coffee tables</Trans>
        </h3>
        <span className="text-xs text-ktip-sand-500">
          <Trans>{tableCount} tables · up to 4 seats</Trans>
        </span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {error ? (
          <p className="text-sm text-ktip-sand-600">{error.message}</p>
        ) : loading ? (
          <div className="h-40 animate-pulse-soft rounded-surface bg-ktip-sand-100" />
        ) : (
          <>
            {state.tables.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {state.tables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    number={tableNumber.get(table.id) ?? 0}
                    mine={table.id === myTable?.id}
                    now={now}
                    onDropIn={
                      state.isHost && !myTable && table.id !== callTable?.id ? () => setVisiting(table.id) : undefined
                    }
                  />
                ))}
              </ul>
            )}

            {callTable && (
              <TableCall
                table={callTable}
                now={now}
                visiting={!myTable}
                onLeave={onLeave}
                leaving={leave.isPending}
              />
            )}

            {/* Coffee roulette: the queue that seats people together. */}
            {!callTable && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-surface bg-ktip-sun-50 px-4 py-3.5">
                <Coffee size={28} className="shrink-0 text-ktip-sun-700" aria-hidden="true" />
                <div className="min-w-0 flex-[1_1_14rem]">
                  <p className="text-sm font-extrabold text-ktip-sand-900">
                    <Trans>Coffee roulette</Trans>
                  </p>
                  <p className="text-sm text-ktip-sand-700" aria-live="polite">
                    {state.inQueue ? (
                      state.waiting >= 3 ? (
                        <Trans>Finding you a table. {state.waiting} people are waiting.</Trans>
                      ) : (
                        <Trans>Waiting for more people. A table needs at least three, and {state.waiting} are here.</Trans>
                      )
                    ) : state.canJoin ? (
                      <Trans>We seat you with three or four people from other teams, for ten minutes.</Trans>
                    ) : state.isHost ? (
                      <Trans>Participants and mentors sit down here. You can drop in to any table below.</Trans>
                    ) : (
                      <Trans>Coffee tables are for participants and mentors.</Trans>
                    )}
                  </p>
                </div>
                {state.inQueue ? (
                  <Button size="sm" variant="secondary" onClick={onLeave} loading={leave.isPending}>
                    <Trans>Stop waiting</Trans>
                  </Button>
                ) : state.canJoin ? (
                  <Button onClick={onJoin} loading={join.isPending} icon={<Coffee size={16} aria-hidden="true" />}>
                    <Trans>Find a table</Trans>
                  </Button>
                ) : null}
              </div>
            )}
          </>
        )}

        {!isVenueVideoConfigured() && (
          <p className="text-xs text-ktip-sand-500">
            <Trans>Video is not switched on for this venue yet, so tables form but have no call.</Trans>
          </p>
        )}
      </div>
    </section>
  )
}

/** Where the four seats sit round a table: top, right, bottom, left. */
const SEAT_ANGLES = [0, 90, 180, 270]

/** One table, drawn as a ring of seats, the way the design draws it. */
function TableCard({
  table,
  number,
  mine,
  now,
  onDropIn,
}: {
  table: CoffeeTable
  number: number
  mine: boolean
  now: number
  onDropIn?: () => void
}) {
  const { t } = useLingui()
  const seated = table.people.map((p) => p.name ?? '').join(', ')
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col items-center gap-2.5 rounded-surface border bg-ktip-cream px-3 py-3.5 text-center',
        mine ? 'border-ktip-tropical-700 ring-1 ring-ktip-tropical-700' : 'border-ktip-sand-200'
      )}
    >
      <span className="text-sm font-extrabold text-ktip-sand-900">{t`Table ${number}`}</span>
      <div className="relative h-30 w-30 max-w-full" role="img" aria-label={seated}>
        {SEAT_ANGLES.map((angle, i) => {
          const person = table.people[i]
          return (
            <span
              key={angle}
              className="absolute left-1/2 top-1/2 -ml-3.75 -mt-3.75 grid h-7.5 w-7.5 place-items-center"
              style={{ transform: `rotate(${angle}deg) translateY(-46px) rotate(${-angle}deg)` }}
              title={person?.name ?? undefined}
            >
              {person ? (
                <DiamondAvatar src={person.avatar_url} name={person.name ?? '?'} size={30} />
              ) : (
                <span className="h-6.5 w-6.5 rounded-full border-[1.5px] border-dashed border-ktip-sand-300" aria-hidden="true" />
              )}
            </span>
          )
        })}
        <span className="absolute inset-8 grid place-items-center rounded-full border border-ktip-sand-200 bg-ktip-sand-50 text-micro font-extrabold tracking-wide text-ktip-sand-500">
          T{number}
        </span>
      </div>
      {mine ? (
        <span className="rounded-full bg-ktip-tropical-50 px-2.5 py-0.5 text-micro font-bold text-ktip-tropical-700">
          <Trans>Your table</Trans>
        </span>
      ) : (
        <span className="text-xs text-ktip-sand-500">
          <Trans>{minutesLeft(table.ends_at, now)} min left</Trans>
        </span>
      )}
      {onDropIn && (
        <Button size="sm" variant="secondary" onClick={onDropIn} icon={<Eye size={14} aria-hidden="true" />}>
          <Trans>Drop in</Trans>
        </Button>
      )}
    </li>
  )
}

function People({ table }: { table: CoffeeTable }) {
  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {table.people.map((p) => (
        <li key={p.user_id} className="flex min-w-0 items-center gap-1.5 text-sm">
          <DiamondAvatar src={p.avatar_url} name={p.name ?? '?'} size={24} />
          <span className="truncate text-ktip-sand-800">{p.name}</span>
          {p.team && <span className="truncate text-xs text-ktip-sand-500">{p.team}</span>}
        </li>
      ))}
    </ul>
  )
}

function TableCall({
  table,
  now,
  visiting,
  onLeave,
  leaving,
}: {
  table: CoffeeTable
  now: number
  visiting: boolean
  onLeave: () => void
  leaving: boolean
}) {
  const { token, grant, error } = useCoffeeTableToken(table.id, true)
  const left = minutesLeft(table.ends_at, now)

  return (
    <div className="flex flex-col gap-3 rounded-surface border border-ktip-tropical-700 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <People table={table} />
        <span className="ml-auto text-xs text-ktip-sand-500">
          <Trans>{left} min left</Trans>
        </span>
        <Button size="sm" variant="secondary" onClick={onLeave} loading={leaving} icon={<LogOut size={14} aria-hidden="true" />}>
          {visiting ? <Trans>Leave the table</Trans> : <Trans>Get up</Trans>}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-amber-700">{error.message}</p>
      ) : token && grant ? (
        <div className="overflow-hidden rounded-surface bg-[radial-gradient(140%_120%_at_20%_0%,#0B2A50,#061A33_55%,#020B18)] p-3 text-white">
          <CallErrorBoundary area="coffee-table-call">
            <Suspense fallback={<div className="h-48 animate-pulse-soft rounded-lg bg-white/10" />}>
              <VenueCall mode="grid" token={token} grant={grant} />
            </Suspense>
          </CallErrorBoundary>
        </div>
      ) : isVenueVideoConfigured() ? (
        <div className="h-48 animate-pulse-soft rounded-xl bg-ktip-sand-100" />
      ) : null}
    </div>
  )
}
