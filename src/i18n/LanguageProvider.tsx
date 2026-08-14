import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { i18n, type Messages } from '@lingui/core'
import { compileMessage } from '@lingui/message-utils/compileMessage'
import { I18nProvider } from '@lingui/react'

/**
 * Teach the production runtime to compile a fallback message.
 *
 * @lingui/core installs its ICU compiler ONLY when
 * `process.env.NODE_ENV !== 'production'`. Everywhere else a message that
 * misses the catalog is rendered as the raw source string — so
 * `Up to {currency} {amount}` reaches the screen with the braces still in it,
 * and lingui logs "Uncompiled message detected!".
 *
 * That is fine while every string is served from a compiled catalog, which is
 * how this app used to work. It stops being fine now that English deliberately
 * ships no catalog and relies on the macro's inline `message` (see
 * `descriptorFields` in vite.config.ts): every interpolated English string
 * would lose its values. Found by screenshotting the landing page, which is the
 * only reason it was caught — nothing throws, the page just renders `{amount}`.
 *
 * Memoised, and that is not optional. `i18n._` calls the compiler on EVERY
 * invocation for an uncompiled message — there is no cache inside lingui — so
 * without this each render of each interpolated <Trans> would re-parse ICU on
 * the main thread. The cache key is the source string, which is immutable and
 * shared across every call site using it, so the parse happens once per unique
 * message per session.
 */
const compiledCache = new Map<string, ReturnType<typeof compileMessage>>()
i18n.setMessagesCompiler((source: string) => {
  const hit = compiledCache.get(source)
  if (hit !== undefined) return hit
  const compiled = compileMessage(source)
  compiledCache.set(source, compiled)
  return compiled
})
import {
  PSEUDO_LANG,
  SYNC_EVENT,
  applyLanguage,
  effectiveLang,
  getLang,
  resolveInitialLanguage,
  type Lang,
} from './language'
import { LanguageContext, type LanguageContextValue } from './LanguageContext'

/**
 * Loads a compiled catalog.
 *
 * `import()` per locale, so Rollup emits `assets/messages-<hash>.js`. That is
 * not stylistic: VitePWA's globPatterns precache js/css/html/ico/svg/woff2 and
 * NOT json, and vercel.json marks /assets immutable for a year. A .json catalog
 * would be missing offline and, unhashed, permanently stale. The compiled ES
 * modules get precaching and hash-busting for free.
 *
 * The paths are written out rather than built from a template because a bare
 * `import(\`./x/${l}\`)` makes Rollup emit every match it can find — including,
 * here, the pseudo catalog in production builds.
 *
 * Writing them out was not enough on its own. Listing `pseudo` unconditionally
 * still emitted its chunk, and VitePWA then precached it: every visitor
 * downloaded ~196 kB of a debugging locale that the switcher does not even offer
 * outside dev. `import.meta.env.DEV` is statically replaced at build time, so
 * the dead branch takes the whole dynamic import with it.
 */
const CATALOGS: Record<Lang, () => Promise<{ messages: Messages }>> = {
  // No import: `activate` short-circuits before reaching this, and naming the
  // module here would still make Rollup emit the 553 kB chunk — which the
  // service worker would then precache for a file nothing ever fetches.
  en: () => Promise.resolve({ messages: {} as Messages }),
  fr: () => import('../locales/fr/messages.mjs'),
  es: () => import('../locales/es/messages.mjs'),
  pseudo: import.meta.env.DEV
    ? () => import('../locales/pseudo/messages.mjs')
    : // Unreachable in production — PSEUDO_ENABLED gates the switcher — but the
      // map has to stay total for `Record<Lang, …>`.
      () => Promise.resolve({ messages: {} as Messages }),
}

async function activate(lang: Lang): Promise<void> {
  /**
   * English loads no catalog at all.
   *
   * The compiled en catalog is a hash-id → English-source lookup table, and
   * since `descriptorFields: 'message'` (vite.config.ts) the macro leaves that
   * same English source inline in whichever chunk uses it. Loading the catalog
   * would fetch 553 kB (166 kB gzip) to map ids onto strings the bundle
   * already has — a third of everything an English reader downloaded before
   * the first paint, for no change in what is rendered.
   *
   * `messages: {}` is not a degraded state here: every lookup misses and falls
   * through to the macro's inline default, which IS the English source.
   *
   * fr and es still load theirs below and override; anything they are missing
   * now falls back to correct English rather than to a raw id.
   */
  if (lang === 'en') {
    i18n.loadAndActivate({ locale: 'en', messages: {} })
    return
  }
  try {
    const { messages } = await CATALOGS[lang]()
    i18n.loadAndActivate({ locale: lang, messages })
  } catch {
    // One retry after a beat. The common causes are transient — a chunk
    // republished mid-request during a deploy, dev-server churn while the
    // catalogs recompile — and without the retry the reader lands on the
    // failure branch below: an English page under a switcher that still shows
    // their chosen language, with nothing anywhere saying why.
    try {
      await new Promise((done) => setTimeout(done, 400))
      const { messages } = await CATALOGS[lang]()
      i18n.loadAndActivate({ locale: lang, messages })
    } catch (error) {
      // A catalog that fails to load — a stale chunk after a deploy, a blocked
      // request — must not blank the app. Every lookup then misses and falls
      // through to the macro's inline `message`, which IS the English source,
      // so the screen stays readable. (That is true since
      // `descriptorFields: 'message'` in vite.config.ts; before it, this path
      // rendered hash ids like "-0B-ue".) Loudly:
      // this is the one failure whose symptom ("my language does not stick")
      // otherwise carries no evidence at all.
      console.error(`[i18n] failed to load the "${lang}" catalog; showing English`, error)
      i18n.loadAndActivate({ locale: 'en', messages: {} })
    }
  }
}

// Activate synchronously with an empty catalog so the very first render has a
// working i18n instance. Every lookup then returns its English source until the
// real catalog resolves a tick later — which is exactly the fallback behaviour
// source-as-key was chosen for.
const initial = resolveInitialLanguage()
applyLanguage(initial.lang, initial.source, initial.source === 'url')
i18n.loadAndActivate({ locale: effectiveLang(initial.lang), messages: {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getLang())
  // English is ready before the first render — it has no catalog to wait for
  // (see activate). Keyed on the raw language rather than effectiveLang so
  // `pseudo`, which does load a catalog, still waits for it.
  const [ready, setReady] = useState(() => getLang() === 'en')

  useEffect(() => {
    let cancelled = false
    void activate(lang).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [lang])

  // Any other mounted switcher, and adoptProfileLanguage() from AuthContext,
  // announce through the same window event the theme hook uses.
  useEffect(() => {
    const onSync = (event: Event) => setLangState((event as CustomEvent<Lang>).detail)
    window.addEventListener(SYNC_EVENT, onSync)
    return () => window.removeEventListener(SYNC_EVENT, onSync)
  }, [])

  const setLang = useCallback((next: Lang) => {
    applyLanguage(next, 'stored', true)
    setLangState(next)
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, uiLang: effectiveLang(lang), setLang, ready, isPseudo: lang === PSEUDO_LANG }),
    [lang, setLang, ready]
  )

  // Nothing renders until the active catalog is in — a no-op for English,
  // which is ready on the first render.
  //
  // For fr and es this prevents a flash of English that then reflows into
  // longer French or Spanish. It is affordable because those catalogs are
  // preloaded from index.html (routeChunkPreloadPlugin in vite.config.ts) and
  // so arrive alongside the entry bundle rather than a round trip after it.
  if (!ready) return null

  return (
    <LanguageContext.Provider value={value}>
      <I18nProvider i18n={i18n}>
        {/*
          A full remount below this point on every switch.
          Switching happens about once a session, and the alternative is policing
          across ~360 files that no component ever reads a label through a
          useMemo whose deps do not include the language. `useMemo(() =>
          rows.map(r => ROLE_LABELS[r.role]), [rows])` is the shape that breaks,
          and no amount of subscription discipline fixes it — a remount does,
          by construction. The QueryClient is created ABOVE this provider
          (src/App.tsx), so nothing refetches.
        */}
        <Fragment key={lang}>{children}</Fragment>
      </I18nProvider>
    </LanguageContext.Provider>
  )
}
