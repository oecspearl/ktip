/**
 * The per-device translation tier, in localStorage.
 *
 * Sits between the in-memory Map and the network. Its whole job is that a
 * RETURNING visitor makes no `/api/translate` call at all — French on the first
 * paint, offline included.
 *
 * Reads are per-key and lazy: there is no boot-time parse of a big JSON blob,
 * because this runs on the render path and a 2,000-entry parse at startup would
 * cost more than the round trip it saves.
 */

import { localKey, type TextFormat } from './hash'

const PREFIX = 'ktip_tx:'
const INDEX_KEY = 'ktip_tx_index'
const MAX_ENTRIES = 2000
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * The stored shape.
 *
 * `s` — the normalised source, kept so an FNV collision is caught on read. The
 *       key is a 32-bit hash plus a length, so collisions are rare but possible;
 *       verifying the source turns "rare but possible wrong translation" into
 *       "rare and harmless miss".
 * `t` — the translation.
 * `e` — expiry, epoch ms.
 */
interface Entry {
  s: string
  t: string
  e: number
}

/**
 * localStorage throws in Safari private mode and is absent in a worker, and
 * every caller here is on a render path. One probe, cached, rather than a
 * try/catch in the hot loop.
 */
let available: boolean | null = null
function storage(): Storage | null {
  if (available === false) return null
  try {
    const probe = '__ktip_tx_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    available = true
    return window.localStorage
  } catch {
    available = false
    return null
  }
}

export function readLocal(text: string, format: TextFormat, lang: string): string | undefined {
  const store = storage()
  if (!store) return undefined
  const key = localKey(text, format, lang)
  const raw = store.getItem(PREFIX + key)
  if (!raw) return undefined

  try {
    const entry = JSON.parse(raw) as Entry
    if (!entry || typeof entry.t !== 'string') return undefined
    if (entry.e < Date.now()) {
      store.removeItem(PREFIX + key)
      return undefined
    }
    // Collision guard. A different source under the same key is a miss.
    if (entry.s !== text) return undefined
    return entry.t
  } catch {
    store.removeItem(PREFIX + key)
    return undefined
  }
}

export function writeLocal(text: string, translated: string, format: TextFormat, lang: string): void {
  const store = storage()
  if (!store) return
  // An unchanged string is not worth a slot: it is either untranslatable or a
  // degraded answer echoing the source, and caching the latter would leave this
  // device stuck on English long after the outage ended.
  if (translated === text) return

  const key = localKey(text, format, lang)
  const entry: Entry = { s: text, t: translated, e: Date.now() + TTL_MS }

  try {
    store.setItem(PREFIX + key, JSON.stringify(entry))
    trackKey(store, key)
  } catch {
    // Almost always QuotaExceededError. Drop the oldest quarter and try once
    // more; if that also fails, this tier simply stops helping — which is a
    // slower app, not a broken one.
    evictOldest(store, 0.25)
    try {
      store.setItem(PREFIX + key, JSON.stringify(entry))
      trackKey(store, key)
    } catch {
      /* give up on persisting; memory tier still works for this session */
    }
  }
}

/**
 * Insertion order, kept separately so eviction does not have to read and parse
 * every entry to find out which are oldest.
 */
function trackKey(store: Storage, key: string): void {
  let index: string[]
  try {
    index = JSON.parse(store.getItem(INDEX_KEY) || '[]') as string[]
    if (!Array.isArray(index)) index = []
  } catch {
    index = []
  }

  // Re-writing an existing key must not add a second index entry, or the index
  // grows without bound while the store stays the same size.
  const at = index.indexOf(key)
  if (at !== -1) index.splice(at, 1)
  index.push(key)

  if (index.length > MAX_ENTRIES) {
    for (const stale of index.splice(0, index.length - MAX_ENTRIES)) {
      store.removeItem(PREFIX + stale)
    }
  }

  try {
    store.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    /* the index is an optimisation; losing it costs eviction accuracy only */
  }
}

function evictOldest(store: Storage, fraction: number): void {
  try {
    const index = JSON.parse(store.getItem(INDEX_KEY) || '[]') as string[]
    if (!Array.isArray(index) || index.length === 0) return
    const drop = Math.max(1, Math.floor(index.length * fraction))
    for (const key of index.splice(0, drop)) store.removeItem(PREFIX + key)
    store.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    /* nothing safe left to do */
  }
}

/** Wipes the tier. Used by the language switcher's "retranslate" escape hatch. */
export function clearLocal(): void {
  const store = storage()
  if (!store) return
  try {
    const index = JSON.parse(store.getItem(INDEX_KEY) || '[]') as string[]
    if (Array.isArray(index)) for (const key of index) store.removeItem(PREFIX + key)
    store.removeItem(INDEX_KEY)
  } catch {
    /* best effort */
  }
}

/** Test seam: forget the availability probe. */
export function resetLocalCacheProbe(): void {
  available = null
}
