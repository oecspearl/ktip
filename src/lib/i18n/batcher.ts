/**
 * Collects every string that renders in a ~50 ms window into ONE request.
 *
 * A 20-card project list asks for 40 strings across 20 components in the same
 * frame. Without this, that is 40 round trips; with it, one. That is the entire
 * reason translation happens at render time rather than inside the ~89 data
 * hooks — a batch that spans several queries cannot form inside any one of them.
 *
 * Two rules this module never breaks:
 *   - it never rejects. A failed translation resolves to the source text, which
 *     is already on the screen. A rejected promise on a render path is a bug
 *     factory and buys nothing.
 *   - it never sends the same string twice in one batch, however many components
 *     asked for it.
 */

import { readLocal, writeLocal } from './local-cache'
import { shouldTranslate } from './should-translate'
import type { TextFormat } from './hash'
import type { TargetLang, TranslateResponse, UiLang } from './protocol'

const WINDOW_MS = 50
const MAX_ITEMS = 200
const MAX_CHARS = 60_000
const MAX_INFLIGHT = 2
const ENDPOINT = '/api/translate'

type Resolver = (text: string) => void

interface Pending {
  text: string
  format: TextFormat
  resolvers: Resolver[]
}

// ---------------------------------------------------------------------------
// Memory tier + subscription
// ---------------------------------------------------------------------------
// A module singleton rather than React state: non-component callers (a filter
// predicate, a sort comparator, a toast raised from an event handler) have to
// read the same values components do, without a hook.

const memory = new Map<string, string>()
const listeners = new Set<() => void>()

const cacheKey = (text: string, format: TextFormat, lang: string) => `${lang}:${format}:${text}`

/**
 * Synchronous read of whatever is already known. Returns undefined on a miss.
 *
 * This is what makes an already-seen string render translated on the FIRST paint
 * with no flash — and what lets a client-side filter match on translated text.
 */
export function peek(text: string, format: TextFormat, lang: string): string | undefined {
  const key = cacheKey(text, format, lang)
  const hit = memory.get(key)
  if (hit !== undefined) return hit

  const persisted = readLocal(text, format, lang)
  if (persisted !== undefined) {
    // Promote so the next read costs nothing and does not touch localStorage.
    memory.set(key, persisted)
    return persisted
  }
  return undefined
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  for (const listener of listeners) listener()
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

let pending = new Map<string, Pending>()
let pendingChars = 0
/**
 * The language the open batch is for. One request carries one `to`, so a batch
 * cannot straddle two languages — if a request arrives for a different one, the
 * open batch is flushed first rather than being sent to the wrong endpoint.
 * In practice this only happens in the frame where a reader switches language.
 */
let pendingLang: TargetLang | null = null
/**
 * Whether the open batch may enter the SHARED Postgres cache. One request
 * carries one `store` flag, so — exactly like `pendingLang` — a batch cannot
 * straddle both, and a request for the other kind flushes what is open first.
 *
 * Mixing them would be the worst kind of bug this file could have: one private
 * string riding along on a `store: true` request is a direct message written
 * into a cache table it was explicitly excluded from.
 */
let pendingStore = true
let timer: ReturnType<typeof setTimeout> | null = null
let inflight = 0
const waiting: (() => void)[] = []

/**
 * Set when the server asks us to back off. Until it passes, nothing is sent and
 * every request resolves to its source immediately — the reader keeps English
 * rather than watching a spinner that a 429 guarantees will not resolve.
 */
let backoffUntil = 0

export interface RequestOptions {
  /**
   * The language `text` was written in, when the caller knows it — a venue chat
   * message carries it on the row, a caption carries it in its payload.
   *
   * Supplying it does two things. It skips the round trip entirely when the text
   * is already in the reader's language, and it is the ONLY thing that unlocks
   * `en` as a target. Omit it and behaviour is exactly what it was before English
   * became a valid target: content is assumed to be English, and an English
   * reader costs nothing.
   */
  from?: string
  /**
   * Whether the result may enter the shared Postgres cache. Defaults to true.
   *
   * `false` is the private path — direct messages, live captions, anything whose
   * text must not outlive the request. It also keeps the result out of
   * localStorage, so it does not outlive the tab either.
   */
  store?: boolean
}

/**
 * Ask for a translation. Resolves with the translation, or with `text` itself if
 * anything at all goes wrong. Never rejects.
 */
export function request(
  text: string,
  format: TextFormat,
  lang: UiLang,
  opts: RequestOptions = {}
): Promise<string> {
  const from = opts.from
  // No source language: assume English, which is what every caller predating
  // this option meant. With one: translate whenever it differs, English included.
  const alreadyThere = from === undefined ? lang === 'en' : from === lang
  if (alreadyThere || !shouldTranslate(text, format)) return Promise.resolve(text)
  const target: TargetLang = lang
  const store = opts.store !== false

  const hit = peek(text, format, lang)
  if (hit !== undefined) return Promise.resolve(hit)

  if (Date.now() < backoffUntil) return Promise.resolve(text)

  if (pendingLang !== null && (pendingLang !== target || pendingStore !== store)) flush()

  return new Promise<string>((resolve) => {
    const key = `${format}:${text}`
    const existing = pending.get(key)
    if (existing) {
      existing.resolvers.push(resolve)
      return
    }

    pending.set(key, { text, format, resolvers: [resolve] })
    pendingChars += text.length
    pendingLang = target
    pendingStore = store

    // Flush early when the batch is already full rather than waiting out the
    // window — a long list should not sit idle behind an arbitrary 50 ms.
    if (pending.size >= MAX_ITEMS || pendingChars >= MAX_CHARS) {
      flush()
    } else if (timer === null) {
      timer = setTimeout(() => flush(), WINDOW_MS)
    }
  })
}

/** Warm the cache for text that is about to be needed — on hover, or on scroll. */
export function prefetch(
  texts: string[],
  format: TextFormat,
  lang: UiLang,
  opts: RequestOptions = {}
): void {
  for (const text of texts) void request(text, format, lang, opts)
}

function flush(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  if (pending.size === 0 || pendingLang === null) return

  const batch = pending
  const lang = pendingLang
  const store = pendingStore
  pending = new Map()
  pendingChars = 0
  pendingLang = null
  pendingStore = true

  const run = () => {
    inflight++
    void send(batch, lang, store).finally(() => {
      inflight--
      const next = waiting.shift()
      if (next) next()
    })
  }

  // A string requested while this batch is in flight lands in the NEXT batch
  // rather than being sent twice.
  if (inflight < MAX_INFLIGHT) run()
  else waiting.push(run)
}

async function send(
  batch: Map<string, Pending>,
  lang: TargetLang,
  store: boolean
): Promise<void> {
  const entries = [...batch.values()]
  let results: TranslateResponse['results'] = {}
  // A degraded answer echoes the source. Persisting that would cache English
  // under a French key and this device would never see French again.
  let persistable = true

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: lang,
        items: entries.map((entry, i) => ({ i, t: entry.text, f: entry.format })),
        // Only sent when false. The server defaults to true, and an omitted
        // field keeps the request identical to what it was before this existed.
        ...(store ? {} : { store: false }),
      }),
    })

    if (res.ok) {
      const data = (await res.json()) as TranslateResponse
      results = data.results ?? {}
      persistable = !data.degraded
      if (data.retryAfter && data.retryAfter > 0) {
        backoffUntil = Date.now() + data.retryAfter * 1000
      }
    }
  } catch {
    // Offline, blocked by an extension, aborted mid-navigation. Fall through and
    // resolve everything with its source.
  }

  let changed = false
  entries.forEach((entry, i) => {
    const translated = results[String(i)]?.t ?? entry.text
    const key = cacheKey(entry.text, entry.format, lang)

    // Memoise even an unchanged answer: it stops this session asking again for a
    // string the server has already declined to translate.
    memory.set(key, translated)
    if (translated !== entry.text) changed = true
    // `store: false` text is kept out of localStorage as well as out of Postgres.
    // The memory tier is fine — it dies with the tab, which is the same lifetime
    // the message already has on screen — but a private message must not still be
    // sitting on the device tomorrow.
    if (persistable && store) writeLocal(entry.text, translated, entry.format, lang)

    for (const resolve of entry.resolvers) resolve(translated)
  })

  // Only wake the tree when something on it actually differs.
  if (changed) notify()
}

/** Test seam: drop every tier and every queued batch. */
export function resetBatcher(): void {
  memory.clear()
  pending = new Map()
  pendingChars = 0
  pendingLang = null
  pendingStore = true
  if (timer !== null) clearTimeout(timer)
  timer = null
  inflight = 0
  waiting.length = 0
  backoffUntil = 0
}
