import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Channel lifecycle helpers, for one property of realtime-js that every
 * subscriber in this app has tripped over: a topic names exactly one channel
 * per tab.
 *
 * - `supabase.channel(topic)` hands back the existing instance when the topic
 *   is already listed, and a second `.subscribe()` on it does nothing.
 * - `removeChannel()` delists by TOPIC, not by instance, once the leave lands.
 *
 * So two components subscribing to the same topic share one channel, and the
 * first to unmount kills it for the other (closing the messaging panel used to
 * stop the FAB's unread dot for the rest of the session). And a late leave from
 * a previous mount delists the new mount's channel, which then stops receiving
 * messages and is never rejoined after a reconnect. StrictMode's double mount
 * hits the second case on every dev load.
 */

let seq = 0

/**
 * Adds a realtime row to a cached, oldest-first list: deduped by id, placed by
 * `created_at`. Realtime handlers that await anything finish in any order, so
 * a plain append can show a reply above the message it answers.
 */
export function insertByCreatedAt<T extends { id: string; created_at: string }>(
  list: T[] | undefined,
  row: T
): T[] {
  if (!list) return [row]
  if (list.some((m) => m.id === row.id)) return list
  // Parsed, not compared as strings: PostgREST, the realtime payload and an
  // optimistic toISOString() each format the same instant differently.
  const at = Date.parse(row.created_at)
  let i = list.length
  while (i > 0 && Date.parse(list[i - 1].created_at) > at) i--
  return [...list.slice(0, i), row, ...list.slice(i)]
}

/**
 * A topic nobody else in this tab is using. For `postgres_changes`, where the
 * topic is only a local label (the filter decides what arrives), so each
 * effect run can have its own channel and never collide with another
 * subscriber or with its own previous run.
 *
 * Not for broadcast or presence: there the topic IS the room, and other
 * people have to be on the same one. Use `freshChannel` for those.
 */
export function uniqueTopic(base: string): string {
  seq += 1
  return `${base}#${seq}`
}

/** Leaves still in flight, by full channel topic. */
const leaving = new Map<string, Promise<void>>()

/**
 * Unsubscribe and retire a channel completely. Recorded per topic so that
 * `freshChannel` can wait for it; resolves once the instance is gone.
 */
export function releaseChannel(channel: RealtimeChannel): Promise<void> {
  const key = channel.topic
  const prior = leaving.get(key) ?? Promise.resolve()
  const done: Promise<void> = prior.then(async () => {
    try {
      await supabase.removeChannel(channel)
    } catch {
      // The leave can time out; teardown below still retires the instance.
    }
    // removeChannel only delists after a clean leave. teardown() disarms the
    // rejoin timer and drops the bindings either way, so this instance can
    // never come back and unsubscribe its replacement.
    try {
      ;(channel as any).teardown?.()
    } catch {
      // Internal API. The removeChannel above is still the documented path.
    }
    // A timed-out leave leaves the dead instance listed, and supabase.channel()
    // would hand it straight back. Nothing else holds this topic yet: creation
    // is queued behind this promise.
    try {
      ;(supabase.realtime as any)._remove?.(channel)
    } catch {
      // Internal API; see above.
    }
  })
  const tracked = done.finally(() => {
    if (leaving.get(key) === tracked) leaving.delete(key)
  })
  leaving.set(key, tracked)
  return tracked
}

/**
 * A never-joined channel for a shared topic (broadcast, presence). Waits out
 * any leave still in flight for the topic, and retires an instance left over
 * from a previous mount rather than reusing it: a channel that has joined once
 * cannot be subscribed again.
 *
 * Pair every channel from here with `releaseChannel`, never a bare
 * `removeChannel`, so the next mount knows to wait.
 */
export async function freshChannel(
  topic: string,
  opts?: Parameters<typeof supabase.channel>[1]
): Promise<RealtimeChannel> {
  await leaving.get(`realtime:${topic}`)
  let channel = supabase.channel(topic, opts)
  if ((channel as any).joinedOnce) {
    await releaseChannel(channel)
    channel = supabase.channel(topic, opts)
  }
  return channel
}
