import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLanguage } from '@/i18n/LanguageContext'
import { peek, prefetch, request, subscribe } from '@/lib/i18n/batcher'
import { shouldTranslate } from '@/lib/i18n/should-translate'
import type { TextFormat } from '@/lib/i18n/hash'

/**
 * Separator for the field-list identity key.
 *
 * A control character, because it is the one thing that cannot appear inside a
 * property name — joining with a comma would make `['a,b']` and `['a','b']`
 * the same key. Written as an escape rather than as a literal byte: a raw NUL in
 * the source makes grep call this file binary and vanishes from every diff.
 */
const FIELD_KEY_SEP = String.fromCharCode(0x1f)

/**
 * The keys of T whose value is a string.
 *
 * Constraining the field lists to these is not pedantry — it is what stops a
 * caller writing `useTranslatedFields(project, ['view_count'])` and shipping a
 * number to a translation API, and it makes `display_name` a compile error to
 * pass on any type where that field is typed as something other than free text.
 */
type StringKeys<T> = {
  [K in keyof T]-?: T[K] extends string | null | undefined ? K : never
}[keyof T]

/**
 * TypeScript cannot narrow `T[StringKeys<T>]` back to `string` — a generic
 * indexed access stays opaque to it however the key is constrained. Rather than
 * scatter casts through every loop below, the unsoundness is confined to these
 * two lines, and both check the value at runtime anyway.
 */
function readString(obj: object, key: PropertyKey): string | undefined {
  const value = (obj as Record<PropertyKey, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function writeString(obj: object, key: PropertyKey, value: string): void {
  ;(obj as Record<PropertyKey, unknown>)[key] = value
}

/**
 * Translation for text MEMBERS wrote — project summaries, event descriptions,
 * grant eligibility. The app's own copy does not come through here; that ships
 * pre-translated in the Lingui catalogs.
 *
 * These hooks run at RENDER time, not inside the ~89 data hooks in this folder.
 * That is a deliberate choice with a real cost, so it is worth stating:
 *
 *   - the ~89 query keys and every existing `invalidateQueries` stay untouched;
 *   - the query cache holds one copy of each row, not one per language;
 *   - optimistic `setQueryData` on create/edit cannot write English into a
 *     French-keyed cache, which would flash English on every save;
 *   - and a batch can span several queries — twenty project cards plus the tags
 *     plus the empty-state line all resolve in ONE request. A per-query
 *     translation could never form that batch.
 *
 * What it costs, and where each is handled:
 *   - a client-side `.includes()` filter searches English. Use `peek()` to match
 *     against both (see matchesTranslated below).
 *   - `.order('title')` in Postgres sorts in English. Re-sort with Intl.Collator
 *     where the list is small enough to matter.
 *   - server-side exports stay English.
 */

/**
 * Subscribe to the batcher's memory tier.
 *
 * Not TanStack Query: translations are never user-scoped, never invalidate, and
 * there are thousands of them. Under the app's `staleTime: 30_000` they would be
 * garbage-collected and refetched forever, for nothing. A module store read
 * through useSyncExternalStore is the right primitive and is tearing-free under
 * React 19 concurrency.
 */
function useTranslationStore(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

// A monotonically increasing version, so the snapshot is a stable primitive and
// useSyncExternalStore does not loop on a fresh object every render.
let version = 0
const getVersion = () => version
subscribe(() => {
  version++
})

/**
 * The translated form of `text`, or `text` itself while that is unknown.
 *
 * Never returns empty, never returns undefined, never suspends. The reader keeps
 * legible English until the French arrives, which for anything already cached is
 * the very first paint.
 */
export function useTranslated(
  text: string | null | undefined,
  format: TextFormat = 'text'
): string {
  const { uiLang } = useLanguage()
  // The value is unused — subscribing is the point. It is what re-runs this
  // component when the batch this string was in comes back.
  useTranslationStore()

  const source = text ?? ''
  const skip = uiLang === 'en' || !shouldTranslate(source, format)

  // Synchronous, so an already-known string renders translated on the FIRST
  // paint rather than flashing English for a frame.
  const known = skip ? undefined : peek(source, format, uiLang)

  useEffect(() => {
    if (skip || known !== undefined) return
    void request(source, format, uiLang)
  }, [skip, known, source, format, uiLang])

  return known ?? source
}

/**
 * Like useTranslated, but says whether it is still waiting.
 *
 * `pending` drives an `aria-busy` and a subtle opacity — NOT a skeleton and not
 * a blank. Many readers here are comfortable in English, so English-then-French
 * beats nothing-then-French, and it keeps the box the same height either way.
 */
export function useTranslatedState(
  text: string | null | undefined,
  format: TextFormat = 'text'
): { text: string; pending: boolean; translated: boolean; source: string } {
  const { uiLang } = useLanguage()
  useTranslationStore()

  const source = text ?? ''
  const skip = uiLang === 'en' || !shouldTranslate(source, format)
  const known = skip ? undefined : peek(source, format, uiLang)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (skip || known !== undefined) return
    setSettled(false)
    let cancelled = false
    void request(source, format, uiLang).then(() => {
      if (!cancelled) setSettled(true)
    })
    return () => {
      cancelled = true
    }
  }, [skip, known, source, format, uiLang])

  return {
    text: known ?? source,
    pending: !skip && known === undefined && !settled,
    /**
     * Whether what is being rendered is machine output rather than what the
     * author wrote.
     *
     * Additive, and it closes a real gap: useTranslatedContent has carried this
     * flag all along but only the room chat acts on it, so a French reader has
     * been shown machine-translated project and grant text with no indication at
     * all. `source` comes back with it so a mark can offer the original.
     */
    translated: !skip && known !== undefined && known !== source,
    source,
  }
}

/**
 * Translate several fields of one record in place.
 *
 *   const project = useTranslatedFields(row, ['title', 'summary'])
 *
 * Pass ONLY fields that are prose. Never `display_name` — that is a person's or
 * an organisation's name, and translating it is always wrong.
 */
export function useTranslatedFields<T extends object>(
  obj: T | null | undefined,
  fields: readonly StringKeys<T>[],
  format: TextFormat = 'text'
): T | null | undefined {
  const { uiLang } = useLanguage()
  const storeVersion = useTranslationStore()

  // Identity, not reference: a caller writing `['title','summary']` inline would
  // otherwise rebuild this on every render and re-run the effect forever.
  const fieldKey = fields.join(FIELD_KEY_SEP)

  const sources = useMemo(() => {
    if (!obj) return []
    return fields
      .map((field) => readString(obj, field))
      .filter((value): value is string => value !== undefined && shouldTranslate(value, format))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj, fieldKey, format])

  useEffect(() => {
    if (uiLang === 'en') return
    for (const source of sources) {
      if (peek(source, format, uiLang) === undefined) void request(source, format, uiLang)
    }
  }, [sources, format, uiLang])

  return useMemo(() => {
    if (!obj || uiLang === 'en') return obj
    let changed = false
    const next = { ...obj }
    for (const field of fields) {
      const value = readString(obj, field)
      if (value === undefined) continue
      const translated = peek(value, format, uiLang)
      if (translated !== undefined && translated !== value) {
        writeString(next, field, translated)
        changed = true
      }
    }
    // Returning the original object when nothing changed keeps referential
    // equality, so memoised children below do not re-render for no reason.
    return changed ? next : obj
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj, fieldKey, format, uiLang, storeVersion])
}

/**
 * Whether useTranslatedFields actually replaced anything on this record.
 *
 * Reference inequality, not a deep compare, and that is exact rather than
 * approximate: the hook above deliberately returns the ORIGINAL object when
 * nothing changed, to preserve referential equality for memoised children. So a
 * different reference means at least one field is now machine output.
 *
 * Free to compute, needs no new plumbing through the hook, and it is what a page
 * needs in order to mark translated content as such.
 */
export function isMachineTranslated<T>(original: T | null | undefined, translated: T | null | undefined): boolean {
  return !!original && !!translated && original !== translated
}

/** Translate a list of records. Same rules as useTranslatedFields. */
export function useTranslatedList<T extends object>(
  rows: T[] | null | undefined,
  fields: readonly StringKeys<T>[],
  format: TextFormat = 'text'
): T[] {
  const { uiLang } = useLanguage()
  const storeVersion = useTranslationStore()
  const fieldKey = fields.join(FIELD_KEY_SEP)

  useEffect(() => {
    if (uiLang === 'en' || !rows) return
    // One pass over the whole list before any of it paints, so the entire
    // viewport lands in a single 50 ms batch rather than one request per card.
    const wanted: string[] = []
    for (const row of rows) {
      for (const field of fields) {
        const value = readString(row, field)
        if (value !== undefined && peek(value, format, uiLang) === undefined) {
          wanted.push(value)
        }
      }
    }
    if (wanted.length > 0) prefetch(wanted, format, uiLang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, fieldKey, format, uiLang])

  return useMemo(() => {
    if (!rows || uiLang === 'en') return rows ?? []
    return rows.map((row) => {
      let changed = false
      const next = { ...row }
      for (const field of fields) {
        const value = readString(row, field)
        if (value === undefined) continue
        const translated = peek(value, format, uiLang)
        if (translated !== undefined && translated !== value) {
          writeString(next, field, translated)
          changed = true
        }
      }
      return changed ? next : row
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, fieldKey, format, uiLang, storeVersion])
}

/**
 * Warm the cache for text about to be needed — on card hover, or as a row scrolls
 * into view — so the detail page is already translated when the route changes.
 */
export function usePrefetchTranslations(): (texts: string[], format?: TextFormat) => void {
  const { uiLang } = useLanguage()
  return useCallback(
    (texts: string[], format: TextFormat = 'text') => prefetch(texts, format, uiLang),
    [uiLang]
  )
}

/**
 * Fire-and-forget warm of a record the CURRENT user just published, in every
 * target language.
 *
 * Call from a create/update mutation's onSuccess. It is the single
 * highest-leverage thing in this whole system: the author's own browser pays the
 * ~1,200 characters, and the first reader in French then gets a cache HIT — an
 * ~80 ms round trip instead of a provider call, landing inside the same batch as
 * the rest of the list, with no visible swap.
 */
export function useWarmTranslations(): (texts: (string | null | undefined)[]) => void {
  return useCallback((texts) => {
    const worth = texts.filter(
      (text): text is string => typeof text === 'string' && shouldTranslate(text)
    )
    if (worth.length === 0) return
    // Deliberately not awaited and deliberately not surfaced: the author must
    // never wait on, or be told about, work done for somebody else's benefit.
    for (const lang of ['fr', 'es'] as const) prefetch(worth, 'text', lang)
  }, [])
}

/**
 * Does `row` match what the reader typed, in either language?
 *
 * A francophone typing "événement" into a filter that only sees English titles
 * gets nothing back. This checks the source AND whatever translation is already
 * in memory — which is everything currently on screen, since it had to be
 * translated to be rendered.
 */
export function matchesTranslated<T extends object>(
  row: T,
  fields: readonly StringKeys<T>[],
  query: string,
  lang: string,
  format: TextFormat = 'text'
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  for (const field of fields) {
    const value = readString(row, field)
    if (value === undefined) continue
    if (value.toLowerCase().includes(needle)) return true
    if (lang === 'en') continue
    const translated = peek(value, format, lang)
    if (translated && translated.toLowerCase().includes(needle)) return true
  }
  return false
}

/**
 * Ref callback that warms a card's translations when it scrolls into view.
 * Cheaper than translating a thousand-row list up front, and invisible either way.
 */
export function useTranslateOnVisible(texts: string[], format: TextFormat = 'text') {
  const { uiLang } = useLanguage()
  const done = useRef(false)

  return useCallback(
    (node: Element | null) => {
      if (!node || done.current || uiLang === 'en' || typeof IntersectionObserver === 'undefined') return
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          done.current = true
          prefetch(texts, format, uiLang)
          observer.disconnect()
        }
      })
      observer.observe(node)
      // React 19 ref cleanup. Without it a virtualised list — and this app uses
      // @tanstack/react-virtual — leaks one live observer per row it scrolls past.
      return () => observer.disconnect()
    },
    [texts, format, uiLang]
  )
}
