import { useEffect, useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { supabase } from '../../../lib/supabase'
import { keys } from '../../../queries/keys'
import type { VenueRoom } from '../../../types'

const MAX = 8000
/** How long after the last keystroke the page is saved. */
const SAVE_AFTER_MS = 900

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

/**
 * One shared page of notes for the room (migration 215): what we are doing
 * today, questions for the mentor. Everyone in the room reads the same page
 * and anyone taking part can write on it.
 *
 * Plain text, saved a moment after you stop typing, last write wins. While you
 * are typing your own words stay put; other people's edits arrive when you
 * pause. It is a scratch page for a few people, not a document with history.
 */
export function RoomNotesPanel({ room, canPost }: { room: VenueRoom; canPost: boolean }) {
  const { t, i18n } = useLingui()
  const fieldId = useId()
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'room-note', room.id)
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const dirty = useRef(false)
  const timer = useRef<number | null>(null)
  const latest = useRef(draft)
  latest.current = draft

  const { data, isPending } = useQuery({
    queryKey: key,
    refetchInterval: 8_000,
    retry: false,
    queryFn: async (): Promise<{ available: boolean; body: string; updated_at: string | null }> => {
      const { data: row, error } = await (supabase as any)
        .from('venue_room_notes')
        .select('body, updated_at')
        .eq('room_id', room.id)
        .maybeSingle()
      if (error) return { available: false, body: '', updated_at: null }
      return { available: true, body: row?.body ?? '', updated_at: row?.updated_at ?? null }
    },
  })

  // Somebody else's edit lands only while this person is not mid-sentence.
  const serverBody = data?.body
  const serverAt = data?.updated_at ?? null
  useEffect(() => {
    if (serverBody === undefined || dirty.current) return
    setDraft(serverBody)
    setSavedAt(serverAt)
  }, [serverBody, serverAt])

  const save = async () => {
    timer.current = null
    const body = latest.current
    setState('saving')
    const { data: at, error } = await (supabase as any).rpc('save_room_note', { p_room_id: room.id, p_body: body })
    if (error) {
      setState('failed')
      return
    }
    // Typed again while it was saving: that keystroke has its own save queued.
    if (latest.current === body) dirty.current = false
    setState('saved')
    setSavedAt(typeof at === 'string' ? at : new Date().toISOString())
    queryClient.setQueryData(key, { available: true, body, updated_at: typeof at === 'string' ? at : null })
  }

  const onChange = (value: string) => {
    dirty.current = true
    setDraft(value.slice(0, MAX))
    setState('idle')
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void save(), SAVE_AFTER_MS)
  }

  // Leaving the room with words still unsaved: send them now.
  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        void (supabase as any).rpc('save_room_note', { p_room_id: room.id, p_body: latest.current })
      }
    },
    [room.id]
  )

  const time = savedAt ? i18n.date(new Date(savedAt), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : ''

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-surface border border-ktip-sand-100 bg-ktip-cream shadow-card" aria-label={t`Shared notes`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ktip-sand-100 px-4 py-3">
        <FileText size={20} className="shrink-0 text-ktip-ocean-600" aria-hidden="true" />
        <h2 className="text-sm font-extrabold text-ktip-sand-900">
          <Trans>Shared notes</Trans>
        </h2>
        <span className="text-xs text-ktip-sand-500" role="status">
          {state === 'saving' ? (
            <Trans>Saving</Trans>
          ) : state === 'failed' ? (
            <Trans>Not saved. Keep typing to try again.</Trans>
          ) : savedAt ? (
            <Trans>Saved at {time}</Trans>
          ) : (
            <Trans>Everyone in this room sees this page</Trans>
          )}
        </span>
      </header>
      {data && !data.available ? (
        <p className="px-4 py-6 text-sm text-ktip-sand-500">
          <Trans>Shared notes are not switched on for this venue yet.</Trans>
        </p>
      ) : isPending ? (
        <div className="m-4 h-40 rounded-control bg-ktip-sand-100 animate-pulse-soft" />
      ) : (
        <div className="p-4">
          <label htmlFor={fieldId} className="sr-only">
            <Trans>Notes for this room</Trans>
          </label>
          <textarea
            id={fieldId}
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            readOnly={!canPost}
            rows={10}
            maxLength={MAX}
            placeholder={canPost ? t`What you are doing today, what is next, questions for the mentor.` : t`Nothing written yet.`}
            className="block min-h-56 w-full resize-y rounded-control border border-ktip-sand-200 bg-ktip-cream px-3 py-2.5 text-sm pointer-coarse:text-body leading-relaxed text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-400 focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-200 read-only:bg-ktip-sand-50"
          />
        </div>
      )}
    </section>
  )
}
