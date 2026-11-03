import { Suspense, lazy, useState } from 'react'
import { Coffee, Eye, LogOut } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../ui/Button'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import { useCoffeeTables } from '../../../hooks/useCoffeeTables'
import { isVenueVideoConfigured, useCoffeeTableToken } from '../../../hooks/useVenueRoomToken'
import { minutesLeft, type CoffeeTable } from '../../../lib/coffee-tables'
import { useNow } from './judging/judging-time'
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
  const others = state.tables.filter((x) => x.id !== callTable?.id)

  const onJoin = () =>
    join.mutate(undefined, { onError: (err: any) => toast.error(err?.message || t`Could not join the queue`) })
  const onLeave = () => {
    if (visiting && !myTable) {
      setVisiting(null)
      return
    }
    leave.mutate(undefined, { onError: (err: any) => toast.error(err?.message || t`Could not leave`) })
  }

  return (
    <section
      className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-ktip-sand-200 bg-white p-4"
      aria-label={t`Coffee tables`}
    >
      <header className="flex items-start gap-2">
        <Coffee size={18} className="mt-0.5 shrink-0 text-ktip-sand-600" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-display text-xl font-bold text-ktip-sand-900">
            <Trans>Coffee tables</Trans>
          </h3>
          <p className="text-sm text-ktip-sand-600">
            <Trans>Sit down with three or four people from other teams for ten minutes. Every table is listed below, and organisers can drop in.</Trans>
          </p>
        </div>
      </header>

      {error ? (
        <p className="text-sm text-ktip-sand-600">{error.message}</p>
      ) : loading ? (
        <div className="h-20 animate-pulse-soft rounded-xl bg-ktip-sand-100" />
      ) : callTable ? (
        <TableCall
          table={callTable}
          now={now}
          visiting={!myTable}
          onLeave={onLeave}
          leaving={leave.isPending}
        />
      ) : state.inQueue ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-ktip-sand-50 px-3 py-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ktip-tropical-500" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-ktip-sand-700" aria-live="polite">
            {state.waiting >= 3 ? (
              <Trans>Finding you a table. {state.waiting} people are waiting.</Trans>
            ) : (
              <Trans>Waiting for more people. A table needs at least three, and {state.waiting} are here.</Trans>
            )}
          </p>
          <Button size="sm" variant="secondary" onClick={onLeave} loading={leave.isPending}>
            <Trans>Stop waiting</Trans>
          </Button>
        </div>
      ) : state.canJoin ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onJoin} loading={join.isPending} icon={<Coffee size={16} aria-hidden="true" />}>
            <Trans>Find a table</Trans>
          </Button>
          {state.waiting > 0 && (
            <span className="text-sm text-ktip-sand-600">
              <Trans>{state.waiting} waiting</Trans>
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-ktip-sand-600">
          {state.isHost ? (
            <Trans>Participants and mentors sit down here. You can drop in to any table below.</Trans>
          ) : (
            <Trans>Coffee tables are for participants and mentors.</Trans>
          )}
        </p>
      )}

      {!isVenueVideoConfigured() && (
        <p className="text-xs text-ktip-sand-500">
          <Trans>Video is not switched on for this venue yet, so tables form but have no call.</Trans>
        </p>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
            <Trans>Tables now</Trans>
          </h4>
          <ul className="flex flex-col gap-2">
            {others.map((table) => (
              <li
                key={table.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-ktip-sand-100 px-3 py-2"
              >
                <People table={table} />
                <span className="ml-auto text-xs text-ktip-sand-500">
                  <Trans>{minutesLeft(table.ends_at, now)} min left</Trans>
                </span>
                {state.isHost && !myTable && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setVisiting(table.id)}
                    icon={<Eye size={14} aria-hidden="true" />}
                  >
                    <Trans>Drop in</Trans>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
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
    <div className="flex flex-col gap-3 rounded-xl border border-ktip-sand-200 p-3">
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
        <div className="overflow-hidden rounded-xl bg-ktip-ink p-2 text-white">
          <Suspense fallback={<div className="h-48 animate-pulse-soft rounded-lg bg-white/10" />}>
            <VenueCall mode="grid" token={token} grant={grant} />
          </Suspense>
        </div>
      ) : isVenueVideoConfigured() ? (
        <div className="h-48 animate-pulse-soft rounded-xl bg-ktip-sand-100" />
      ) : null}
    </div>
  )
}
