import { useState } from 'react'
import { ChevronDown, ScrollText, Target } from 'lucide-react'
import { usePublicEventSections } from '../../../hooks/useEventPageSections'
import { useTranslated, useTranslatedList } from '../../../hooks/useTranslated'
import { presetByKey } from '../../../lib/venue-room-presets'
import { DocumentsPanel } from '../../documents/DocumentsPanel'
import type { Event, VenueRoom } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * Host-written text: what this room is for, and the rules of the place.
 *
 * The content lives in the section's own config rather than in a column, for
 * the same reason the sponsor links do: it is content for one panel on one
 * room. A host can write it three ways:
 *
 *   body       a paragraph
 *   items      short rows, each a title and a line under it ("No calls and no
 *              chat" / "Your microphone stays off while you are here")
 *   checklist  things each person ticks off for themselves ("By the end you
 *              will"); the ticks stay on that person's device
 *
 * `title` renames the card. With nothing written, the objectives panel falls
 * back to the room's own description and its preset's hint, so a host who
 * ticks the box and types nothing still gets something true, not an empty card.
 */
export function RoomTextSection({
  variant,
  config,
  room,
}: {
  variant: 'objectives' | 'rules'
  config: Record<string, unknown>
  room: VenueRoom
}) {
  const { t } = useLingui()
  const written = typeof config.body === 'string' ? config.body.trim() : ''
  const rawItems = Array.isArray(config.items)
    ? config.items
        .map((entry) => {
          const row = (entry || {}) as Record<string, unknown>
          return {
            title: typeof row.title === 'string' ? row.title.trim().slice(0, 80) : '',
            detail: typeof row.detail === 'string' ? row.detail.trim().slice(0, 200) : '',
          }
        })
        .filter((row) => row.title)
        .slice(0, 8)
    : []
  const rawChecks = Array.isArray(config.checklist)
    ? config.checklist
        .filter((entry): entry is string => typeof entry === 'string')
        .map((text) => ({ text: text.trim().slice(0, 120) }))
        .filter((row) => row.text)
        .slice(0, 8)
    : []
  const structured = rawItems.length > 0 || rawChecks.length > 0
  const source = written || (variant === 'objectives' && !structured ? fallbackObjectives(room) : '')
  // Hooks before the early return. An empty string is a no-op for the
  // translator: shouldTranslate() rejects it outright.
  const body = useTranslated(source)
  const ownTitle = useTranslated(typeof config.title === 'string' ? config.title.trim().slice(0, 40) : '')
  const items = useTranslatedList(rawItems, ['title', 'detail'])
  const checks = useTranslatedList(rawChecks, ['text'])
  const [ticked, setTicked] = useTicks(`ktip.room.checks.${room.id}.${variant}`)
  if (!body && !structured) return null

  const Icon = variant === 'objectives' ? Target : ScrollText
  const title = ownTitle || (variant === 'objectives' ? t`What this room is for` : t`House rules`)

  return (
    <div className="rounded-2xl border border-ktip-sand-100 bg-ktip-cream shadow-card">
      <p className="flex min-h-11.5 items-center gap-1.5 border-b border-ktip-sand-100 px-4 py-2 text-micro font-extrabold uppercase tracking-[0.08em] text-ktip-sand-500">
        <Icon size={14} className="shrink-0 text-ktip-ocean-600" aria-hidden="true" />
        {title}
      </p>
      {/*
        Rendered as text, never as markup. This is host-authored and reaches
        every attendee in the room, which is the exact shape of an injection.
      */}
      {body && <p className="whitespace-pre-line px-4 py-3 text-sm leading-relaxed text-ktip-sand-700">{body}</p>}
      {checks.length > 0 && (
        <ul className="flex flex-col gap-1 px-2.5 py-2.5">
          {checks.map((row, index) => {
            const on = ticked.includes(index)
            return (
              <li key={`${row.text}-${index}`}>
                <label className="flex min-h-9 cursor-pointer items-start gap-2.5 rounded-control px-1.5 py-1.5 text-sm text-ktip-sand-800 hover:bg-ktip-sand-50">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setTicked(on ? ticked.filter((i) => i !== index) : [...ticked, index])}
                    className="mt-0.5 h-4.5 w-4.5 shrink-0 rounded border-ktip-sand-300 text-ktip-tropical-700 focus:ring-ktip-ocean-300"
                  />
                  <span className={on ? 'break-words text-ktip-sand-500 line-through' : 'break-words'}>{row.text}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {items.length > 0 && (
        <ul className="divide-y divide-ktip-sand-100">
          {items.map((row, index) => (
            <li key={`${row.title}-${index}`} className="px-4 py-2.5">
              <span className="block break-words text-sm font-bold text-ktip-sand-900">{row.title}</span>
              {row.detail && <span className="block break-words text-xs text-ktip-sand-500">{row.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Which rows of a checklist this person has ticked, kept on this device. */
function useTicks(key: string): [number[], (next: number[]) => void] {
  const [ticked, setTicked] = useState<number[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? '[]')
      return Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n)) : []
    } catch {
      return []
    }
  })
  const update = (next: number[]) => {
    setTicked(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Blocked storage: the ticks last for this visit.
    }
  }
  return [ticked, update]
}

function fallbackObjectives(room: VenueRoom): string {
  const hint = presetByKey(room.key)?.hint
  return [room.description, hint].filter(Boolean).join('\n\n')
}

/**
 * Files attached to the event.
 *
 * entity_documents already scopes to entity_type='event' and already decides
 * who may read what through doc_access_role(), so this is the existing panel in
 * a different place — not a second copy of the access rules.
 */
export function RoomResourcesPanel({
  event,
  isHost,
}: {
  event: Pick<Event, 'id'>
  isHost: boolean
}) {
  return <DocumentsPanel entityType="event" entityId={event.id} canEditEntity={isHost} />
}

/**
 * The event's FAQ, where people are actually standing.
 *
 * Reads the page builder's own `faq` section rather than inventing a second
 * place to write one — a host who has answered a question once should not have
 * to answer it again per room.
 */
export function RoomFaqPanel({ eventId }: { eventId: string }) {
  const { sections } = usePublicEventSections(eventId)
  const [open, setOpen] = useState<number | null>(0)

  const parsed = (sections || [])
    .filter((s) => s.section_type === 'faq')
    .flatMap((s) => {
      const raw = (s.content as { items?: unknown })?.items
      if (!Array.isArray(raw)) return []
      return raw
        .map((entry) => {
          const row = (entry || {}) as Record<string, unknown>
          return {
            question: typeof row.question === 'string' ? row.question : '',
            answer: typeof row.answer === 'string' ? row.answer : '',
          }
        })
        .filter((row) => row.question)
    })

  // Both fields in one pass, so the whole FAQ lands in a single batch with the
  // rest of the room rather than one request per question as they expand.
  const items = useTranslatedList(parsed, ['question', 'answer'])

  if (!items.length) return null

  return (
    <div className="rounded-2xl border border-ktip-sand-100 bg-ktip-cream shadow-card">
      <p className="border-b border-ktip-sand-100 px-4 py-3 font-display text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
        <Trans>Common questions</Trans>
      </p>
      <ul className="divide-y divide-ktip-sand-100">
        {items.map((item, i) => (
          <li key={`${item.question}-${i}`}>
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-ktip-sand-800 hover:bg-ktip-sand-50"
            >
              <span className="min-w-0 flex-1">{item.question}</span>
              <ChevronDown
                size={14}
                className={`shrink-0 text-ktip-sand-400 transition-transform ${
                  open === i ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
            {open === i && item.answer && (
              <p className="whitespace-pre-line px-4 pb-3 text-sm leading-relaxed text-ktip-sand-600">
                {item.answer}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
