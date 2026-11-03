import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { FLUSH_MS, createUsageMeter, type SpeechUsageKind, type UsageMeter } from '../lib/speech-usage'

/**
 * A meter for one kind of browser speech in one room (199). Returns `add`;
 * the hook sends the running total once a minute, when the tab is hidden and
 * when the room changes. A failed report is dropped: usage is a record, not a
 * bill, and retrying would trip the server's rate limit anyway.
 */
export function useSpeechUsage(roomId: string | undefined, kind: SpeechUsageKind) {
  const meterRef = useRef<UsageMeter | null>(null)

  useEffect(() => {
    if (!roomId) return
    const meter = createUsageMeter((amount) => {
      void (supabase as any)
        .rpc('log_speech_usage', { p_room_id: roomId, p_kind: kind, p_amount: amount })
        .then(
          () => {},
          () => {}
        )
    })
    meterRef.current = meter
    const timer = setInterval(() => meter.flush(), FLUSH_MS)
    const onHide = () => {
      if (document.visibilityState === 'hidden') meter.flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onHide)
      meter.flush()
      if (meterRef.current === meter) meterRef.current = null
    }
  }, [roomId, kind])

  // Stable across renders; a no-op until the room is known.
  const addRef = useRef((amount: number) => meterRef.current?.add(amount))
  return addRef.current
}
