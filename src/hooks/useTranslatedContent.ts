import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useContentLanguage } from '@/i18n/useContentLanguage'
import { peek, prefetch, request, subscribe } from '@/lib/i18n/batcher'
import { shouldTranslate } from '@/lib/i18n/should-translate'
import { UI_LANGS, isUiLang } from '@/lib/i18n/protocol'
import type { TextFormat } from '@/lib/i18n/hash'
import type { UiLang } from '@/lib/i18n/protocol'

/**
 * Translation for text whose SOURCE LANGUAGE IS KNOWN.
 *
 * The hooks in useTranslated.ts assume English in and French or Spanish out,
 * which is right for project summaries and event copy — those are written in
 * English. It is wrong the moment two members talk to each other: in a venue
 * room a francophone types French, and the reader who needs help is the
 * anglophone.
 *
 * Two things follow from knowing the source, and they are the reason this is a
 * separate file rather than an extra argument on the existing hooks:
 *
 *   - English becomes a valid target. It is deliberately NOT one when the source
 *     is unknown, because "translate everything into English as well" would put
 *     a bill on every reader who currently costs nothing.
 *   - Text already in the reader's language costs nothing at all. No request, no
 *     cache entry, no provider characters — the check is a string comparison.
 *
 * Callers get the original back alongside the translation, because a reader must
 * always be able to see what was actually typed. Machine translation of casual
 * speech is wrong often enough that hiding the source is not defensible,
 * particularly where a mentor is reading a student.
 */

// Same module-store subscription useTranslated.ts uses: translations are never
// user-scoped and never invalidate, so TanStack Query is the wrong primitive.
let version = 0
const getVersion = () => version
subscribe(() => {
  version++
})

function useTranslationStore(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

/**
 * Resolve a stored `lang` value to something the batcher can compare.
 *
 * NULL is every row written before migration 100, plus anything sent by a client
 * that has not been updated. Reading it as English is right for essentially all
 * of them, and being wrong is cheap: the provider is asked to translate English
 * into English and answers with the source unchanged.
 */
function sourceLang(value: string | null | undefined): UiLang {
  return isUiLang(value) ? value : 'en'
}

export interface TranslatedContent {
  /** What to render — the translation, or the source until one exists. */
  text: string
  /** What was actually typed. Always available, for the "show original" toggle. */
  source: string
  /** True when `text` differs from `source`, i.e. there is something to toggle. */
  translated: boolean
  /** True while a translation is in flight. Drives aria-busy, never a skeleton. */
  pending: boolean
  /** The resolved source language, for "translated from French". */
  from: UiLang
}

export interface TranslatedContentOptions {
  format?: TextFormat
  /**
   * Whether the translation may enter the shared Postgres cache. Default true.
   *
   * Leave it true for anything room-scoped or organiser-written: the cache is
   * what makes the second reader free, and it is the entire economics of this
   * feature. Set it false for direct messages and live captions — see the list
   * of what must never be written to that table in migration 097.
   */
  store?: boolean
}

/**
 * The translated form of `text`, given the language it was written in.
 *
 * Never returns empty, never suspends, never rejects. The reader sees the
 * original until the translation lands, which for anything already cached is the
 * first paint.
 */
export function useTranslatedContent(
  text: string | null | undefined,
  from: string | null | undefined,
  opts: TranslatedContentOptions = {}
): TranslatedContent {
  const format: TextFormat = opts.format ?? 'text'
  const store = opts.store !== false
  const { lang, autoTranslate } = useContentLanguage()
  useTranslationStore()

  const source = text ?? ''
  const written = sourceLang(from)
  const skip = !autoTranslate || written === lang || !shouldTranslate(source, format)

  // Synchronous, so an already-known string renders translated on the FIRST
  // paint rather than flashing the source for a frame.
  const known = skip ? undefined : peek(source, format, lang)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (skip || known !== undefined) return
    setSettled(false)
    let cancelled = false
    void request(source, format, lang, { from: written, store }).then(() => {
      if (!cancelled) setSettled(true)
    })
    return () => {
      cancelled = true
    }
  }, [skip, known, source, format, lang, written, store])

  const resolved = known ?? source
  return {
    text: resolved,
    source,
    translated: resolved !== source,
    pending: !skip && known === undefined && !settled,
    from: written,
  }
}

/**
 * Fire-and-forget warm of something the current member just wrote, into every
 * other language.
 *
 * This is the single highest-leverage call in the whole feature, and it is worth
 * being precise about why. Translation is billed per miss, and cached per
 * content hash — so whoever asks first pays, and everybody after them is free.
 * Left alone, "whoever asks first" is a reader, mid-conversation, watching a
 * message sit in a language they cannot read until the round trip returns.
 *
 * Called here, the author's own browser pays instead, in the moment after they
 * hit send when they are reading their own message and waiting for nothing. By
 * the time it reaches anyone else it is a cache HIT — it lands already
 * translated, in the same paint as the message itself, with no swap.
 *
 * Deliberately not awaited and deliberately not surfaced: the sender must never
 * wait on, or be told about, work done for somebody else's benefit.
 */
export function useWarmContentTranslations(): (
  text: string | null | undefined,
  from: string | null | undefined,
  opts?: TranslatedContentOptions
) => void {
  return useCallback((text, from, opts = {}) => {
    const format: TextFormat = opts.format ?? 'text'
    const store = opts.store !== false
    // Pointless for a private message: with `store: false` there is no shared
    // cache entry for the warm to leave behind, so it would spend the author's
    // characters to help precisely nobody.
    if (!store) return
    const source = text ?? ''
    if (!shouldTranslate(source, format)) return
    const written = sourceLang(from)
    for (const target of UI_LANGS) {
      if (target === written) continue
      void request(source, format, target, { from: written, store })
    }
  }, [])
}

/**
 * Warm a whole list before any of it paints.
 *
 * Without this, twenty messages rendering in the same frame each fire their own
 * effect — the batcher still coalesces them, but only if they land inside its
 * 50 ms window, and a slow first paint can straddle it. One pass up front makes
 * a viewport of chat exactly one request rather than "usually one".
 */
export function usePrefetchTranslatedContent(
  items: readonly { text: string | null | undefined; lang?: string | null }[],
  opts: TranslatedContentOptions = {}
): void {
  const format: TextFormat = opts.format ?? 'text'
  const store = opts.store !== false
  const { lang, autoTranslate } = useContentLanguage()

  // Length rather than the array itself: the caller's list is rebuilt on every
  // render by a query hook, and depending on the reference would re-run this on
  // every keystroke in the composer.
  const count = items.length

  useEffect(() => {
    if (!autoTranslate) return
    // Grouped by source language, because one request carries one `from` and the
    // batcher flushes when it changes — sending them interleaved would turn a
    // mixed-language room into one request per message.
    const byLang = new Map<UiLang, string[]>()
    for (const item of items) {
      const source = item.text ?? ''
      const written = sourceLang(item.lang)
      if (written === lang || !shouldTranslate(source, format)) continue
      if (peek(source, format, lang) !== undefined) continue
      const bucket = byLang.get(written)
      if (bucket) bucket.push(source)
      else byLang.set(written, [source])
    }
    for (const [written, texts] of byLang) {
      prefetch(texts, format, lang, { from: written, store })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, format, lang, autoTranslate, store])
}
