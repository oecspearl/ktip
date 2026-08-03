import { createContext, useContext } from 'react'
import type { UiLang } from '@/lib/i18n/protocol'
import type { Lang } from './language'

export interface LanguageContextValue {
  /** What the reader picked, including the dev-only pseudo locale. */
  lang: Lang
  /** What to send to the translation API and format dates with — never `pseudo`. */
  uiLang: UiLang
  setLang: (lang: Lang) => void
  /** False until the compiled catalog for `lang` has loaded. */
  ready: boolean
  isPseudo: boolean
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext)
  if (!value) {
    throw new Error('useLanguage must be used inside <LanguageProvider>')
  }
  return value
}
