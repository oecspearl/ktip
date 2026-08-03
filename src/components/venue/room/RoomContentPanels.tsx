import { useState } from 'react'
import { ChevronDown, ScrollText, Target } from 'lucide-react'
import { usePublicEventSections } from '../../../hooks/useEventPageSections'
import { presetByKey } from '../../../lib/venue-room-presets'
import { DocumentsPanel } from '../../documents/DocumentsPanel'
import type { Event, VenueRoom } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * Host-written text: what this room is for, and the rules of the place.
 *
 * The body lives in the section's own config rather than in a column, for the
 * same reason the sponsor links do — it is content for one panel on one room.
 * With nothing written, the objectives panel falls back to the room's own
 * description and its preset's hint, so a host who ticks the box and types
 * nothing still gets something true rather than an empty card.
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
  const body = written || (variant === 'objectives' ? fallbackObjectives(room) : '')
  if (!body) return null

  const Icon = variant === 'objectives' ? Target : ScrollText
  const title = variant === 'objectives' ? t`What this room is for` : t`House rules`

  return (
    <div className="rounded-2xl border border-ktip-sand-100 bg-ktip-cream p-4 shadow-card">
      <p className="mb-1.5 flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
        <Icon size={14} className="text-ktip-ocean-600" aria-hidden="true" />
        {title}
      </p>
      {/*
        Rendered as text, never as markup. This is host-authored and reaches
        every attendee in the room, which is the exact shape of an injection.
      */}
      <p className="whitespace-pre-line text-sm leading-relaxed text-ktip-sand-700">{body}</p>
    </div>
  )
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

  const items = (sections || [])
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
