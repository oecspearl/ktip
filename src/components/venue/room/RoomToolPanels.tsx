import { useMemo, useState } from 'react'
import { Cpu, ExternalLink, Megaphone, Plus, Search, Trash2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import {
  useAnnounceAll,
  useBookingSlots,
  useKit,
  useLibrary,
  type LibraryKind,
} from '../../../hooks/useRoomTools'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import { Button } from '../../ui/Button'
import { RoomPanel, RoomPanelEmpty } from './RoomPanel'
import type { VenueRoom } from '../../../types'

const field =
  'w-full min-w-0 rounded-control border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm pointer-coarse:text-body text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-400 focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-200'

function useFail() {
  const { t } = useLingui()
  const toast = useToast()
  return (err: any) => toast.error(err?.message || t`Could not save that`)
}

function NotYet() {
  return (
    <RoomPanelEmpty>
      <Trans>This is not switched on for this venue yet.</Trans>
    </RoomPanelEmpty>
  )
}

// ============================================================ kit

/** The Hardware Bench: what there is, how many are left, reserve one. */
export function KitPanel({ room, isHost, canPost }: { room: VenueRoom; isHost: boolean; canPost: boolean }) {
  const { t } = useLingui()
  const auth = useAuth()
  const fail = useFail()
  const { items, loading, available, reserve, save, remove } = useKit(room.id, room.event_id, auth.user?.id)
  const [name, setName] = useState('')
  const [total, setTotal] = useState('')

  return (
    <RoomPanel title={t`Kit`} meta={available && items.length ? t`Collect from the bench crew` : undefined}>
      {!available ? (
        <NotYet />
      ) : loading ? (
        <div className="m-4 h-24 rounded-control bg-ktip-sand-100 animate-pulse-soft" />
      ) : items.length === 0 && !isHost ? (
        <RoomPanelEmpty>
          <Trans>Nothing to borrow yet.</Trans>
        </RoomPanelEmpty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          {items.map((item) => {
            const left = Math.max(0, item.total - item.taken)
            const share = item.total > 0 ? left / item.total : 0
            return (
              <li key={item.id} className="flex min-w-0 flex-col gap-2 rounded-surface border border-ktip-sand-100 bg-ktip-sand-50 p-3">
                <div className="flex items-center gap-2">
                  <Cpu size={15} className="shrink-0 text-ktip-tropical-700" aria-hidden="true" />
                  <b className="min-w-0 flex-1 break-words text-sm text-ktip-sand-900">{item.name}</b>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-ktip-sand-600">
                    <Trans>{left} of {item.total}</Trans>
                  </span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-ktip-sand-200" aria-hidden="true">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      left === 0 ? 'bg-red-600' : share < 0.34 ? 'bg-ktip-sun-500' : 'bg-ktip-tropical-600'
                    )}
                    style={{ width: `${share * 100}%` }}
                  />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {item.mine ? (
                    <Button size="sm" variant="secondary" pressed onClick={() => reserve.mutate({ id: item.id, on: false }, { onError: fail })}>
                      <Trans>Give it back</Trans>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canPost || left === 0}
                      onClick={() => reserve.mutate({ id: item.id, on: true }, { onError: fail })}
                    >
                      {left === 0 ? <Trans>Out</Trans> : <Trans>Reserve one</Trans>}
                    </Button>
                  )}
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => remove.mutate(item.id, { onError: fail })}
                      aria-label={t`Remove ${item.name}`}
                      className="icon-hit ml-auto rounded-lg p-1.5 text-ktip-sand-400 hover:bg-ktip-sand-100 hover:text-red-600"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {available && isHost && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const n = Number(total)
            if (name.trim().length < 2 || !Number.isInteger(n) || n < 0) return
            save.mutate(
              { id: null, name: name.trim(), total: n },
              { onSuccess: () => { setName(''); setTotal('') }, onError: fail }
            )
          }}
          className="flex flex-wrap items-end gap-2 border-t border-ktip-sand-100 px-4 py-3"
        >
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-bold text-ktip-sand-700">
            <Trans>Item</Trans>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t`ESP32 boards`} className={field} />
          </label>
          <label className="flex w-24 flex-col gap-1 text-xs font-bold text-ktip-sand-700">
            <Trans>How many</Trans>
            <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" className={field} />
          </label>
          <Button type="submit" size="sm" icon={<Plus size={14} aria-hidden="true" />} loading={save.isPending}>
            <Trans>Add</Trans>
          </Button>
        </form>
      )}
    </RoomPanel>
  )
}

// ============================================================ booking slots

/** "Book 15 minutes" with a sponsor or a mentor, one row of times per person. */
export function BookingSlotsPanel({
  room,
  isHost,
  canPost,
  title,
}: {
  room: VenueRoom
  isHost: boolean
  canPost: boolean
  title?: string
}) {
  const { t, i18n } = useLingui()
  const auth = useAuth()
  const fail = useFail()
  const me = auth.user?.id
  const { slots, loading, available, book, offer, remove } = useBookingSlots(room.id)
  const [when, setWhen] = useState('')

  const hosts = useMemo(() => {
    const byHost = new Map<string, typeof slots>()
    for (const slot of slots) byHost.set(slot.host_id, [...(byHost.get(slot.host_id) ?? []), slot])
    return [...byHost.values()]
  }, [slots])
  const canOffer = isHost

  return (
    <RoomPanel title={title || t`Book 15 minutes`}>
      {!available ? (
        <NotYet />
      ) : loading ? (
        <div className="m-4 h-20 rounded-control bg-ktip-sand-100 animate-pulse-soft" />
      ) : hosts.length === 0 ? (
        <RoomPanelEmpty>
          <Trans>No times on offer right now.</Trans>
        </RoomPanelEmpty>
      ) : (
        <ul className="divide-y divide-ktip-sand-100">
          {hosts.map((list) => {
            const host = list[0].host
            const name = host?.display_name || t`Member`
            return (
              <li key={list[0].host_id} className="flex flex-col gap-2.5 px-4 py-3">
                <span className="flex items-center gap-2.5">
                  <DiamondAvatar src={host?.avatar_url} name={name} size={28} />
                  <span className="text-sm font-bold text-ktip-sand-900">
                    <Trans>Talk to {name}</Trans>
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {list.map((slot) => {
                    const mine = slot.booked_by === me
                    const taken = !!slot.booked_by && !mine
                    const own = slot.host_id === me
                    const time = i18n.date(new Date(slot.starts_at), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
                    return (
                      <span key={slot.id} className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={taken || own || (!mine && !canPost)}
                          aria-pressed={mine}
                          onClick={() => book.mutate({ id: slot.id, on: !mine }, { onError: fail })}
                          title={mine ? t`Booked by you. Press to give it back.` : taken ? t`Taken` : undefined}
                          className={cn(
                            'h-9 rounded-control border px-3 text-sm font-bold tabular-nums transition-colors disabled:cursor-not-allowed',
                            mine
                              ? 'border-ktip-tropical-600 bg-ktip-tropical-50 text-ktip-tropical-700'
                              : taken
                                ? 'border-ktip-sand-200 bg-ktip-sand-100 text-ktip-sand-400 line-through'
                                : 'border-ktip-sand-200 bg-ktip-cream text-ktip-sand-800 hover:border-ktip-ocean-400'
                          )}
                        >
                          {time}
                        </button>
                        {(isHost || own) && (
                          <button
                            type="button"
                            onClick={() => remove.mutate(slot.id, { onError: fail })}
                            aria-label={t`Remove the ${time} slot`}
                            className="icon-hit rounded-lg p-1 text-ktip-sand-400 hover:text-red-600"
                          >
                            <Trash2 size={12} aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    )
                  })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {available && canOffer && me && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const at = new Date(when)
            if (Number.isNaN(at.getTime())) return
            offer.mutate(
              { hostId: me, startsAt: at.toISOString(), minutes: 15 },
              { onSuccess: () => setWhen(''), onError: fail }
            )
          }}
          className="flex flex-wrap items-end gap-2 border-t border-ktip-sand-100 px-4 py-3"
        >
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-bold text-ktip-sand-700">
            <Trans>Offer 15 minutes with you at</Trans>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} />
          </label>
          <Button type="submit" size="sm" icon={<Plus size={14} aria-hidden="true" />} loading={offer.isPending}>
            <Trans>Offer</Trans>
          </Button>
        </form>
      )}
    </RoomPanel>
  )
}

// ============================================================ library

/** Datasets, APIs, starter kits and guides for this event, searchable. */
export function LibraryPanel({ eventId, isHost }: { eventId: string; isHost: boolean }) {
  const { t } = useLingui()
  const fail = useFail()
  const { items, loading, available, save, remove } = useLibrary(eventId)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<LibraryKind | 'all'>('all')
  const [draft, setDraft] = useState({ title: '', kind: 'dataset' as LibraryKind, format: '', languages: 'en', url: '', detail: '' })

  const filters: Array<{ id: LibraryKind | 'all'; label: string }> = [
    { id: 'all', label: t`All` },
    { id: 'dataset', label: t`Datasets` },
    { id: 'api', label: t`APIs` },
    { id: 'starter', label: t`Starter kits` },
    { id: 'guide', label: t`Guides` },
  ]
  const needle = query.trim().toLowerCase()
  const shown = items.filter(
    (item) =>
      (kind === 'all' || item.kind === kind) &&
      (!needle || `${item.title} ${item.detail ?? ''}`.toLowerCase().includes(needle))
  )
  // Named for the catalog: "{itemCount} items", not "{0} items".
  const itemCount = items.length

  return (
    <RoomPanel title={t`Library`} meta={available && items.length ? t`${itemCount} items` : undefined}>
      {!available ? (
        <NotYet />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5 px-4 pt-3">
            <label className="relative min-w-48 flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ktip-sand-400" aria-hidden="true" />
              <span className="sr-only">
                <Trans>Search the library</Trans>
              </span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t`Search datasets, APIs, guides`} className={cn(field, 'pl-8')} />
            </label>
            <span className="flex flex-wrap gap-1.5" role="group" aria-label={t`Show`}>
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={kind === f.id}
                  onClick={() => setKind(f.id)}
                  className="h-8 rounded-full border border-ktip-sand-200 px-3 text-xs font-bold text-ktip-sand-700 hover:border-ktip-ocean-400 aria-pressed:border-brand-navy aria-pressed:bg-brand-navy aria-pressed:text-white"
                >
                  {f.label}
                </button>
              ))}
            </span>
          </div>
          {loading ? (
            <div className="m-4 h-24 rounded-control bg-ktip-sand-100 animate-pulse-soft" />
          ) : shown.length === 0 ? (
            <RoomPanelEmpty>{items.length ? <Trans>Nothing matches.</Trans> : <Trans>The library is empty for now.</Trans>}</RoomPanelEmpty>
          ) : (
            <ul className="mt-2 divide-y divide-ktip-sand-100 border-t border-ktip-sand-100">
              {shown.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex h-7 w-11 shrink-0 items-center justify-center rounded-sm bg-ktip-ocean-50 text-[10px] font-extrabold tracking-[0.04em] text-ktip-ocean-700">
                    {item.format || item.kind.slice(0, 3).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-bold text-ktip-sand-900">{item.title}</span>
                    {item.detail && <span className="block break-words text-xs text-ktip-sand-500">{item.detail}</span>}
                  </span>
                  {item.languages.length > 0 && (
                    <span className="hidden shrink-0 rounded-sm border border-ktip-sand-200 px-1.5 text-[10px] font-extrabold uppercase tracking-[0.04em] text-ktip-sand-600 sm:inline">
                      {item.languages.join(' · ')}
                    </span>
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-control border border-ktip-sand-200 px-2.5 text-xs font-bold text-ktip-sand-800 hover:border-ktip-ocean-400"
                    >
                      <ExternalLink size={12} aria-hidden="true" />
                      <Trans>Open</Trans>
                    </a>
                  )}
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => remove.mutate(item.id, { onError: fail })}
                      aria-label={t`Remove ${item.title}`}
                      className="icon-hit shrink-0 rounded-lg p-1.5 text-ktip-sand-400 hover:bg-ktip-sand-100 hover:text-red-600"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isHost && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (draft.title.trim().length < 2) return
                const url = draft.url.trim()
                if (url && !/^https?:\/\//i.test(url)) return
                save.mutate(
                  {
                    id: null,
                    title: draft.title.trim(),
                    detail: draft.detail.trim() || null,
                    kind: draft.kind,
                    format: draft.format.trim() || null,
                    languages: draft.languages
                      .split(/[,\s·]+/)
                      .map((l) => l.trim().toLowerCase())
                      .filter((l) => l === 'en' || l === 'fr' || l === 'es'),
                    url: url || null,
                  },
                  {
                    onSuccess: () => setDraft({ title: '', kind: draft.kind, format: '', languages: 'en', url: '', detail: '' }),
                    onError: fail,
                  }
                )
              }}
              className="grid grid-cols-1 gap-2 border-t border-ktip-sand-100 px-4 py-3 sm:grid-cols-2"
            >
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} placeholder={t`Title`} aria-label={t`Title`} className={field} />
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as LibraryKind })} aria-label={t`Type`} className={field}>
                {filters.slice(1).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} maxLength={200} placeholder={t`One line about it`} aria-label={t`Description`} className={field} />
              <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://" aria-label={t`Link`} className={field} />
              <input value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value })} maxLength={6} placeholder={t`Format, like CSV`} aria-label={t`Format`} className={field} />
              <input value={draft.languages} onChange={(e) => setDraft({ ...draft, languages: e.target.value })} placeholder="en, fr, es" aria-label={t`Languages`} className={field} />
              <Button type="submit" size="sm" className="justify-self-start" icon={<Plus size={14} aria-hidden="true" />} loading={save.isPending}>
                <Trans>Add to the library</Trans>
              </Button>
            </form>
          )}
        </>
      )}
    </RoomPanel>
  )
}

// ============================================================ announce to every room

/** One message from an organiser into every open room's chat. */
export function AnnounceAllPanel({ eventId, openRooms }: { eventId: string; openRooms: number }) {
  const { t } = useLingui()
  const toast = useToast()
  const fail = useFail()
  const announce = useAnnounceAll(eventId)
  const [body, setBody] = useState('')

  return (
    <RoomPanel title={t`Announce to every room`} meta={<Megaphone size={14} aria-hidden="true" />}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const text = body.trim()
          if (!text) return
          announce.mutate(text, {
            onSuccess: (count) => {
              setBody('')
              toast.success(t`Sent to ${count} rooms.`)
            },
            onError: fail,
          })
        }}
        className="flex flex-col gap-2.5 p-4"
      >
        <label htmlFor={`announce-${eventId}`} className="text-xs font-bold text-ktip-sand-700">
          <Trans>Message</Trans>
        </label>
        <textarea
          id={`announce-${eventId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={t`Submissions close in one hour. Submit from your Homebase.`}
          className={field}
        />
        <p className="text-xs text-ktip-sand-500">
          <Trans>It shows in the chat of every open room, Quiet Room included.</Trans>
        </p>
        <Button type="submit" size="sm" className="self-start" loading={announce.isPending} disabled={!body.trim()}>
          <Trans>Send to {openRooms} rooms</Trans>
        </Button>
      </form>
    </RoomPanel>
  )
}
