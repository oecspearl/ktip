import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { i18n, type Messages } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
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
  en: () => import('../locales/en/messages.mjs'),
  fr: () => import('../locales/fr/messages.mjs'),
  es: () => import('../locales/es/messages.mjs'),
  pseudo: import.meta.env.DEV
    ? () => import('../locales/pseudo/messages.mjs')
    : // Unreachable in production — PSEUDO_ENABLED gates the switcher — but the
      // map has to stay total for `Record<Lang, …>`.
      () => Promise.resolve({ messages: {} as Messages }),
}

async function activate(lang: Lang): Promise<void> {
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
      // request — must not blank the app. Lingui falls back to the message id,
      // which IS the English source, so the screen stays readable. Loudly:
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
  const [ready, setReady] = useState(false)

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
