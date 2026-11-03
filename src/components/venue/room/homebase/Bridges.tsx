import { useState } from 'react'
import { Cable, Check, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useToast } from '../../../../contexts/ToastContext'
import { Button } from '../../../ui/Button'
import { isLive, useBridges } from '../../../../hooks/useBridges'
import type { EventTeam } from '../../../../hooks/useEventTeams'

/**
 * At another team's door: ask to join their Homebase call for a while
 * (migration 197). Shows the state of an earlier request instead of the form.
 */
export function BridgeRequestCard({ eventId, hostTeam, myTeam }: { eventId: string; hostTeam: EventTeam; myTeam: EventTeam | null }) {
  const { t, i18n } = useLingui()
  const toast = useToast()
  const { bridges, request, end } = useBridges(eventId)
  const [minutes, setMinutes] = useState(30)
  const [message, setMessage] = useState('')

  if (!myTeam) {
    return (
      <p className="text-sm text-ktip-sand-600">
        <Trans>Join or form a team to ask for a bridge.</Trans>
      </p>
    )
  }

  const mine = bridges.find((b) => b.from_team_id === myTeam.id && b.to_team_id === hostTeam.id && (b.status === 'pending' || isLive(b)))
  if (mine?.status === 'pending') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-ktip-sand-700">
        <Trans>Request sent. Waiting for {hostTeam.name}.</Trans>
        <Button size="sm" variant="ghost" onClick={() => end.mutate(mine.id)}>
          <Trans>Withdraw</Trans>
        </Button>
      </div>
    )
  }
  if (mine && isLive(mine)) {
    return (
      <p className="text-sm text-ktip-tropical-800">
        {t`Bridge open until ${i18n.date(mine.expires_at!, { hour: '2-digit', minute: '2-digit' })}. Reload to go in.`}
      </p>
    )
  }

  return (
    <form
      className="mx-auto flex max-w-md flex-col gap-2 text-left"
      onSubmit={(e) => {
        e.preventDefault()
        request.mutate(
          { toTeam: hostTeam.id, minutes, message: message.trim() },
          {
            onSuccess: () => toast.success(t`Request sent to ${hostTeam.name}`),
            onError: (err: any) => toast.error(err?.message || t`Could not send the request`),
          }
        )
      }}
    >
      <label className="text-sm font-medium text-ktip-sand-800">
        <Trans>Message</Trans>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={300}
          placeholder={t`e.g. Can we compare notes on the landing data?`}
          className="mt-1 w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
        />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium text-ktip-sand-800">
          <Trans>For</Trans>
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="mt-1 block rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
          >
            {[15, 30, 60, 120].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? t`${m} minutes` : t`${m / 60} h`}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" loading={request.isPending} icon={<Cable size={16} aria-hidden="true" />}>
          <Trans>Ask to join their call</Trans>
        </Button>
      </div>
      <p className="text-xs text-ktip-sand-500">
        <Trans>If they accept, your team can join their call and chat until the time runs out. Their workspace stays private.</Trans>
      </p>
    </form>
  )
}

/** Inside a Homebase: requests from other teams, and bridges open right now. */
export function IncomingBridges({ eventId, team, teams }: { eventId: string; team: EventTeam; teams: EventTeam[] }) {
  const { t, i18n } = useLingui()
  const toast = useToast()
  const { bridges, respond, end } = useBridges(eventId)
  const nameOf = (id: string) => teams.find((x) => x.id === id)?.name ?? t`Another team`
  const incoming = bridges.filter((b) => b.to_team_id === team.id && b.status === 'pending')
  const live = bridges.filter((b) => (b.to_team_id === team.id || b.from_team_id === team.id) && isLive(b))
  if (!incoming.length && !live.length) return null

  return (
    <div className="space-y-1.5 rounded-xl border border-ktip-ocean-200 bg-ktip-ocean-50 p-3 text-sm">
      {incoming.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-2">
          <Cable size={14} className="text-ktip-ocean-700" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {t`${nameOf(b.from_team_id)} asks to join your call for ${b.minutes} minutes.`}
            {b.message && <span className="block text-xs text-ktip-sand-600">“{b.message}”</span>}
          </span>
          <Button
            size="sm"
            icon={<Check size={14} aria-hidden="true" />}
            onClick={() => respond.mutate({ id: b.id, accept: true }, { onError: (e: any) => toast.error(e?.message) })}
          >
            <Trans>Let them in</Trans>
          </Button>
          <button
            type="button"
            aria-label={t`Decline`}
            onClick={() => respond.mutate({ id: b.id, accept: false })}
            className="rounded-lg border border-ktip-sand-200 bg-white p-1.5 text-ktip-sand-600 hover:text-red-600"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
      {live.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-2 text-ktip-ocean-900">
          <Cable size={14} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {b.to_team_id === team.id
              ? t`${nameOf(b.from_team_id)} can join your call until ${i18n.date(b.expires_at!, { hour: '2-digit', minute: '2-digit' })}.`
              : t`You can join ${nameOf(b.to_team_id)}'s call until ${i18n.date(b.expires_at!, { hour: '2-digit', minute: '2-digit' })}.`}
          </span>
          <Button size="sm" variant="ghost" onClick={() => end.mutate(b.id)}>
            <Trans>End bridge</Trans>
          </Button>
        </div>
      ))}
    </div>
  )
}
