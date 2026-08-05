import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import {
  CALENDAR_ACCENT_COLORS,
  CALENDAR_ACCENT_DOT_COLORS,
  CALENDAR_ACCENT_GRADIENTS,
  CALENDAR_NOTE_KIND_LABELS,
} from './constants'
import type { CalendarItem } from './calendar'
import type { CalendarNote } from '../types'

/** `calendar_note:<id>` — the prefix every producer uses to stay unique. */
export function calendarNoteItemId(id: string): string {
  return `calendar_note:${id}`
}

/**
 * Map a personal note onto the generic calendar item shape.
 *
 * No `href`: a note has no page of its own, and giving it one would mean a
 * route, a detail view and a second place to edit it. The panel already is its
 * detail view.
 */
export function calendarNoteToItem(note: CalendarNote): CalendarItem {
  const done = note.kind === 'task' && note.is_done
  return {
    id: calendarNoteItemId(note.id),
    kind: 'calendar_note',
    title: note.title,
    start: note.starts_at,
    end: note.ends_at,
    chipClass: CALENDAR_ACCENT_COLORS[note.accent_color],
    dotClass: CALENDAR_ACCENT_DOT_COLORS[note.accent_color],
    gradientClass: CALENDAR_ACCENT_GRADIENTS[note.accent_color],
    badgeLabel: i18n._(CALENDAR_NOTE_KIND_LABELS[note.kind]),
    subtitle: done ? i18n._(msg`Done`) : undefined,
    statusLabel: done ? i18n._(msg`Done`) : undefined,
    description: note.body,
    dimmed: done,
    mine: true,
  }
}
