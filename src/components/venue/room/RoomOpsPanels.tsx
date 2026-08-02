import { useState } from 'react'
import { Lock, Megaphone, ScreenShare, Square, Unlock } from 'lucide-react'
import { formatRelativeTime } from '../../../lib/utils'
import { useToast } from '../../../contexts/ToastContext'
import { useVenueRoomMessages } from '../../../hooks/useVenueRoomMessages'
import { useVenueRoomMutations } from '../../../hooks/useVenueRooms'
import { useRoomBroadcast } from '../../../hooks/useVenueCheckIn'
import { Button } from '../../ui/Button'
import { RoomPanel, RoomPanelEmpty } from './RoomPanel'
import type { useRoomSignals } from '../../../hooks/useRoomSignals'
import type { VenueRoom } from '../../../types'

/**
 * The three host actions that belong in the room rather than in the editor.
 *
 * Closing a room, announcing something and taking the floor are all things a
 * host does *while* the event is running, standing in the room it applies to.
 * Everything slower than that — renaming, recolouring, moving a wall — stays in
 * the venue builder, where it can be undone before it is saved.
 *
 * Gated by the registry's `roles`, and again by the server: the room update is
 * an organizer-only RLS policy and the broadcast is an is_venue_host() check
 * inside venue_room_broadcast(). Presenting is the exception and deliberately
 * so — it rides the room's broadcast channel, grants nothing, and only decides
 * which panel is drawn largest.
 */
export function HostControlsPanel({
  room,
  signals,
}: {
  room: VenueRoom
  signals: ReturnType<typeof useRoomSignals>
}) {
  const toast = useToast()
  const { updateRoom, loading: saving } = useVenueRoomMutations()
  const { broadcast, loading: sending } = useRoomBroadcast()
  const [body, setBody] = useState('')

  const toggleOpen = async () => {
    try {
      await updateRoom({
        roomId: room.id,
        eventId: room.event_id,
        updates: { is_open: !room.is_open },
      })
      toast.success(room.is_open ? 'Room closed' : 'Room open')
    } catch (err: any) {
      toast.error(err?.message || 'Could not change the room')
    }
  }

  const send = async () => {
    const text = body.trim()
    if (!text) return
    try {
      await broadcast({ roomId: room.id, body: text })
      setBody('')
      toast.success('Announced in this room')
    } catch (err: any) {
      toast.error(err?.message || 'Could not post the announcement')
    }
  }

  return (
    <div className="rounded-2xl border border-ktip-ocean-200 bg-ktip-ocean-50/60 p-4">
      <p className="mb-2 flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wider text-ktip-ocean-700">
        <Megaphone size={14} aria-hidden="true" />
        Host controls
      </p>

      <div className="flex flex-wrap items-start gap-2">
        <textarea
          rows={2}
          value={body}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Say something to everyone in this room…"
          aria-label="Announcement for this room"
          className="min-w-0 flex-1 rounded-xl border border-ktip-sand-200 bg-ktip-cream px-3 py-2 text-sm"
        />
        <Button size="sm" onClick={send} loading={sending} disabled={!body.trim()}>
          Announce
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-ktip-sand-500">
        Posts as the venue, not as you — it renders as a system line in the chat.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleOpen}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg border border-ktip-sand-200 bg-ktip-cream px-2.5 py-1.5 text-xs font-semibold text-ktip-sand-700 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700 disabled:opacity-50"
        >
          {room.is_open ? (
            <Lock size={13} aria-hidden="true" />
          ) : (
            <Unlock size={13} aria-hidden="true" />
          )}
          {room.is_open ? 'Close this room' : 'Reopen this room'}
        </button>

        {/*
          Presenting is a layout signal, not a permission: while it is on, the
          call takes the big cell on everyone's screen and the cameras arrange
          themselves around one speaker. Nobody is muted by it, and anyone who
          promotes a different panel keeps their choice.
        */}
        <button
          type="button"
          onClick={() => signals.setPresenting(!signals.iAmPresenting)}
          disabled={!signals.connected}
          aria-pressed={signals.iAmPresenting}
          title={
            signals.connected
              ? 'Puts the call in the big panel for everyone in this room'
              : 'Not connected to this room’s live channel'
          }
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            signals.iAmPresenting
              ? 'border-ktip-ocean-600 bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700'
              : 'border-ktip-sand-200 bg-ktip-cream text-ktip-sand-700 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700'
          }`}
        >
          {signals.iAmPresenting ? (
            <Square size={12} aria-hidden="true" />
          ) : (
            <ScreenShare size={13} aria-hidden="true" />
          )}
          {signals.iAmPresenting ? 'Stop presenting' : 'Present'}
        </button>

        {signals.presenter && !signals.iAmPresenting && (
          <span className="text-[11px] text-ktip-sand-500">
            {signals.presenter.name} is presenting.
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * What the room itself has said.
 *
 * Reads the same query the chat panel does and keeps only kind='system', so
 * host announcements and anything a future migration logs are readable without
 * scrolling back through the conversation they are buried in.
 */
export function ActivityLogPanel({ roomId }: { roomId: string }) {
  const { messages, loading } = useVenueRoomMessages(roomId)
  const log = (messages || []).filter((m) => m.kind === 'system').slice(-20).reverse()

  return (
    <RoomPanel title="Room log" meta={log.length || undefined}>
      {loading ? (
        <div className="p-4">
          <div className="h-3 w-2/3 rounded bg-ktip-sand-100 animate-pulse-soft" />
        </div>
      ) : log.length === 0 ? (
        <RoomPanelEmpty>Nothing has been announced in this room.</RoomPanelEmpty>
      ) : (
        <ul className="max-h-[18rem] divide-y divide-ktip-sand-100 overflow-y-auto">
          {log.map((entry) => (
            <li key={entry.id} className="px-4 py-2">
              <p className="text-xs leading-relaxed text-ktip-sand-700">{entry.body}</p>
              <p className="mt-0.5 text-[10px] text-ktip-sand-400">
                {formatRelativeTime(entry.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </RoomPanel>
  )
}
