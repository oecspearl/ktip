import { supabase } from '../supabase'
import type { DraftAngle, DraftLang, DraftPlatform, ShareKind } from './draft-prompt'
import { lineBuffer } from './lines'

export interface DraftTakeResult {
  platform: DraftPlatform
  angle: DraftAngle
  text: string
  /** Numbers in the take that the item's record does not contain. */
  unmatched: string[]
}

/** Why a draft failed, in terms the panel can explain to a member. */
export type DraftFailure = 'signed_out' | 'rate_limited' | 'not_shareable' | 'unavailable'

export class DraftError extends Error {
  reason: DraftFailure
  constructor(reason: DraftFailure) {
    super(reason)
    this.reason = reason
  }
}

/**
 * POST /api/share. The server loads the item itself; only ids and choices go
 * up, plus the take on screen when the member asks for a different one.
 *
 * The reply streams: `onAllowed` gets the record's numbers first, then
 * `onTake` fires once per message as the model finishes it, in the order the
 * apps were listed. Resolves with the number of messages once the stream
 * ends; rejects with a DraftError if none came, or with the AbortError when
 * `signal` fires.
 */
export async function requestShareDrafts(
  args: {
    kind: ShareKind
    id: string
    /** The app on screen first: it is written first. */
    platforms: DraftPlatform[]
    lang: DraftLang
    /** Regenerate: just this style. */
    angle?: DraftAngle
    /** Regenerate: the text to move away from. */
    avoid?: string
  },
  handlers: { onTake: (take: DraftTakeResult) => void; onAllowed?: (allowed: string[]) => void },
  signal?: AbortSignal
): Promise<number> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new DraftError('signed_out')

  let res: Response
  try {
    res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new DraftError('unavailable')
  }

  if (res.status === 401) throw new DraftError('signed_out')
  if (res.status === 429) throw new DraftError('rate_limited')
  if (res.status === 404) throw new DraftError('not_shareable')
  if (!res.ok || !res.body) throw new DraftError('unavailable')

  let count = 0
  let failed = false
  const handle = (line: string) => {
    let event: Record<string, unknown>
    try {
      event = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    if (event.type === 'start' && Array.isArray(event.allowed)) handlers.onAllowed?.(event.allowed as string[])
    else if (event.type === 'error') failed = true
    else if (event.type === 'take' && typeof event.app === 'string' && typeof event.text === 'string') {
      count++
      handlers.onTake({
        platform: event.app as DraftPlatform,
        angle: event.angle as DraftAngle,
        text: event.text,
        unmatched: Array.isArray(event.unmatched) ? (event.unmatched as string[]) : [],
      })
    }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const lines = lineBuffer()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      lines.push(decoder.decode(value, { stream: true })).forEach(handle)
    }
    lines.flush().forEach(handle)
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    // The connection dropped mid-way. What already arrived stays on screen.
    failed = true
  }

  if (count === 0) throw new DraftError('unavailable')
  if (failed) console.warn('[share] draft stream ended early after', count, 'messages')
  return count
}
