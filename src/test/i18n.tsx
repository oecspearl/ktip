import type { ReactNode } from 'react'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { messages } from '../locales/en/messages.mjs'
import { LanguageContext } from '../i18n/LanguageContext'

/**
 * The English catalog, activated once for the whole test run.
 *
 * Loading the REAL compiled catalog rather than `{}` is deliberate. With an
 * empty catalog every `<Trans>` falls back to its source text, so a test would
 * pass even if the message had been dropped from the catalog entirely — which
 * is precisely the regression the catalogs exist to prevent. With the real one,
 * a component asserting on "Save changes" is also asserting that "Save changes"
 * survived extraction.
 */
i18n.loadAndActivate({ locale: 'en', messages })

/**
 * A static language context, rather than the real LanguageProvider.
 *
 * Components that translate user content call `useTranslated`, which reads this
 * context and throws without it — so a component test that never mentions i18n
 * still fails the moment its component starts translating a database field.
 *
 * The real provider is not used because it resolves the language from
 * localStorage, the profile and `navigator.languages`, then dynamically imports
 * a catalog chunk. That is three sources of nondeterminism and one async
 * boundary imported into every component test, to answer a question every test
 * has the same answer to: English.
 *
 * `uiLang: 'en'` also short-circuits the translation batcher before it reaches
 * the network, so no test can accidentally issue a fetch.
 */
const TEST_LANGUAGE = {
  lang: 'en',
  uiLang: 'en',
  setLang: () => {},
  ready: true,
  isPseudo: false,
} as const

export function I18nTestProvider({ children }: { children: ReactNode }) {
  return (
    <LanguageContext.Provider value={TEST_LANGUAGE}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </LanguageContext.Provider>
  )
}
