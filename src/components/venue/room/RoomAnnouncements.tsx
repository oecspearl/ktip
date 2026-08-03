import { useState } from 'react'
import { formatRelativeTime } from '../../../lib/utils'
import { usePublishedEventUpdates } from '../../../hooks/useEventUpdates'
import { EVENT_UPDATE_TYPE_LABELS } from '../../../lib/constants'
import { RoomPanel, RoomPanelEmpty } from './RoomPanel'
import { Trans, useLingui } from '@lingui/react/macro'

/** How many updates before the panel stops growing and offers a "show all". */
const COLLAPSED = 3

/**
 * The organizer's updates, inside the room.
 *
 * Same rows as the event page — published only, newest first. A hackathon
 * announcement that lives one navigation away from where people are standing is
 * an announcement half of them miss.
 */
export function RoomAnnouncements({ eventId }: { eventId: string }) {
  const { t } = useLingui()
  const { updates, loading } = usePublishedEventUpdates(eventId)
  const [expanded, setExpanded] = useState(false)

  const all = updates || []
  const shown = expanded ? all : all.slice(0, COLLAPSED)

  return (
    <RoomPanel title={t`Announcements`} meta={all.length || undefined}>
      {loading ? (
        <div className="space-y-2 p-4">
          <div className="h-3 w-2/3 rounded bg-ktip-sand-100 animate-pulse-soft" />
          <div className="h-3 w-1/2 rounded bg-ktip-sand-100 animate-pulse-soft" />
        </div>
      ) : all.length === 0 ? (
        <RoomPanelEmpty><Trans>Nothing announced yet.</Trans></RoomPanelEmpty>
      ) : (
        <>
          <ul className="divide-y divide-ktip-sand-100">
            {shown.map((update) => (
              <li key={update.id} className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ktip-ocean-600">
                  {EVENT_UPDATE_TYPE_LABELS[update.update_type] || update.update_type}
                </p>
                <p className="mt-0.5 text-sm font-medium text-ktip-sand-900">{update.title}</p>
                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-ktip-sand-600">
                  {update.content}
                </p>
                <p className="mt-1.5 text-[11px] text-ktip-sand-400">
                  {formatRelativeTime(update.created_at)}
                </p>
              </li>
            ))}
          </ul>
          {all.length > COLLAPSED && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full border-t border-ktip-sand-100 px-4 py-2 text-xs font-semibold text-ktip-ocean-600 hover:bg-ktip-sand-50"
            >
              {expanded ? t`Show fewer` : t`Show all ${all.length}`}
            </button>
          )}
        </>
      )}
    </RoomPanel>
  )
}
