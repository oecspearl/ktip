import { useCallback, useState } from 'react'
import { Circle, Video } from 'lucide-react'
import { Trans } from '@lingui/react/macro'

/**
 * The notice somebody sees BEFORE their camera and microphone are published
 * into a room that may be recorded.
 *
 * Before, not after, and that ordering is the whole point. The red dot in
 * AvStage's header tells you a recording is happening; it does not give you the
 * chance to decide not to be in it. By the time you have read it your voice is
 * already in the file.
 *
 * So this gates the connection itself. Until it is acknowledged, no LiveKit
 * socket opens and no track is published — the room is still there, the chat
 * still works, and the member can read and type without being recorded.
 *
 * The acknowledgement is per room and per device, in localStorage, deliberately
 * not on the profile: it is a decision about this room on this machine, not a
 * standing consent to be recorded anywhere in the venue. Somebody joining from a
 * shared laptop in a lab should be asked again.
 */

const STORAGE_PREFIX = 'ktip_rec_ack:'

function storageKey(roomId: string) {
  return `${STORAGE_PREFIX}${roomId}`
}

/** Read synchronously, so an already-acknowledged room does not flash the gate. */
function hasAcknowledged(roomId: string): boolean {
  try {
    return localStorage.getItem(storageKey(roomId)) === '1'
  } catch {
    // Safari private mode. Asking every time is the safe failure here — the
    // alternative is treating "cannot remember" as "already agreed".
    return false
  }
}

export function useRecordingConsent(roomId: string, required: boolean) {
  const [acknowledged, setAcknowledged] = useState(() => !required || hasAcknowledged(roomId))

  const acknowledge = useCallback(() => {
    try {
      localStorage.setItem(storageKey(roomId), '1')
    } catch {
      /* the choice still applies for this session */
    }
    setAcknowledged(true)
  }, [roomId])

  return { acknowledged, acknowledge }
}

export function RecordingConsent({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-red-200">
        <Circle size={10} className="fill-red-400 text-red-400" aria-hidden="true" />
        <Trans>This room is recorded</Trans>
      </p>
      <p className="text-xs leading-relaxed text-white/70">
        <Trans>
          If you join the call, your camera, microphone and anything you share on
          screen are recorded and saved by the organisers. You can stay in the room
          without joining the call — you will still see the chat and can still take
          part.
        </Trans>
      </p>
      <button
        type="button"
        onClick={onAccept}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
      >
        <Video size={13} aria-hidden="true" />
        <Trans>I understand — join the call</Trans>
      </button>
    </div>
  )
}
