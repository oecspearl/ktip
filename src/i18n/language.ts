/**
 * Which language the app is in, where that came from, and how it is remembered.
 *
 * A module singleton plus a window CustomEvent, mirroring
 * src/hooks/useThemeMode.ts — so a non-React caller (a zod schema, a helper in
 * lib/, a toast raised inside an event handler) reads the same value React does
 * without importing a hook.
 */

import { UI_LANGS, isUiLang, type UiLang } from '@/lib/i18n/protocol'

export const STORAGE_KEY = 'ktip_lang'
export const SYNC_EVENT = 'ktip-language-change'

/**
 * Dev-only. Renders accented, bracketed, ~30% longer text so that any string
 * still hardcoded in English stands out, and any layout that cannot survive
 * French's extra length breaks visibly — before a character has been paid for.
 */
export const PSEUDO_LANG = 'pseudo'
export type Lang = UiLang | typeof PSEUDO_LANG

export const SELECTABLE_LANGS = UI_LANGS

/**
 * Is the pseudo-locale reachable?
 *
 * Dev builds only. It is a diagnostic, not a language: it renders every
 * translated string accented, bracketed and ~30% longer, so an unwrapped string
 * shows up as plain English against the noise, and any layout that cannot
 * survive French's extra length breaks visibly — before a character has been
 * paid for. Shipping it to production would put a junk locale one URL parameter
 * away from any visitor.
 */
export const PSEUDO_ENABLED = import.meta.env.DEV

/** Empty today. `dir` is derived from it so adding Arabic is one entry here. */
export const RTL_LANGS = new Set<Lang>()

export const LANGUAGE_NAMES: Record<UiLang, string> = {
  // Endonyms, deliberately: someone who cannot read the current UI language can
  // still find their own. "Français" is findable in an English UI; "French" in a
  // French UI is not.
  en: 'English',
  fr: 'Français',
  es: 'Español',
}

function isLang(value: unknown): value is Lang {
  if (value === PSEUDO_LANG) return PSEUDO_ENABLED
  return isUiLang(value)
}

/**
 * Where the current value came from. This is not decoration: an explicit choice
 * must never be overridden by a profile row or a browser header, and only a
 * guess may be.
 */
export type LangSource = 'url' | 'stored' | 'profile' | 'navigator' | 'default'

let current: Lang = 'en'
let source: LangSource = 'default'

export function getLang(): Lang {
  return current
}

export function getLangSource(): LangSource {
  return source
}

/** The language used for provider calls and catalogs — pseudo maps onto English. */
export function effectiveLang(lang: Lang = current): UiLang {
  return lang === PSEUDO_LANG ? 'en' : lang
}

function readStored(): Lang | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLang(stored) ? stored : null
  } catch {
    return null
  }
}

function readUrl(): Lang | null {
  try {
    const param = new URLSearchParams(window.location.search).get('lang')
    return isLang(param) ? param : null
  } catch {
    return null
  }
}

function readNavigator(): Lang | null {
  try {
    for (const tag of navigator.languages ?? []) {
      const base = tag.toLowerCase().split('-')[0]
      if (isUiLang(base)) return base
    }
  } catch {
    /* non-browser environment */
  }
  return null
}

/**
 * Resolve the starting language.
 *
 * Order — and the reason for each step:
 *   1. `?lang=`      a shared link must land in the language it was shared in
 *   2. localStorage  an explicit prior choice, and the only one the pre-render
 *                    script in index.html can read synchronously
 *   3. profile       applied later by adoptProfileLanguage(), once auth resolves
 *   4. navigator     a guess, but a good one
 *   5. 'en'
 */
export function resolveInitialLanguage(): { lang: Lang; source: LangSource } {
  const fromUrl = readUrl()
  if (fromUrl) return { lang: fromUrl, source: 'url' }

  const stored = readStored()
  if (stored) return { lang: stored, source: 'stored' }

  const guess = readNavigator()
  if (guess) return { lang: guess, source: 'navigator' }

  return { lang: 'en', source: 'default' }
}

/**
 * Apply a language and remember it.
 *
 * `persist: false` is for a guess — it takes effect but is not written, so it
 * stays a guess and a later profile value can still win.
 */
export function applyLanguage(lang: Lang, from: LangSource, persist = true): void {
  current = lang
  source = from

  try {
    document.documentElement.lang = effectiveLang(lang)
    document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr'
  } catch {
    /* not a browser */
  }

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // The choice still applies for this session; it just will not survive a
      // reload. Silent because Safari private mode is not the reader's problem.
    }
  }

  try {
    window.dispatchEvent(new CustomEvent<Lang>(SYNC_EVENT, { detail: lang }))
  } catch {
    /* not a browser */
  }
}

/**
 * Adopt `profiles.preferred_language` once auth resolves.
 *
 * AuthProvider sits BELOW LanguageProvider — it must, so that switching language
 * cannot tear down the session — so the value arrives imperatively rather than
 * through props. It is ignored unless the current value is a guess: a reader who
 * has explicitly chosen a language on this device must not have that reversed by
 * a stale row on their profile.
 */
export function adoptProfileLanguage(preferred: string | null | undefined): boolean {
  if (!isLang(preferred)) return false
  if (source === 'url' || source === 'stored') return false
  if (preferred === current) return false

  applyLanguage(preferred, 'profile', true)
  return true
}
