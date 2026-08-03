import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from './LanguageContext'
import { isUiLang, type UiLang } from '../lib/i18n/protocol'

/**
 * What language OTHER MEMBERS' writing should be shown in.
 *
 * Distinct from `useLanguage().uiLang`, which is what the app's own chrome is
 * rendered in, and the distinction is not pedantry — it is the whole point of
 * `profiles.content_language` (migration 100). Two real readers this separates:
 * the participant whose French is stronger than their English but who navigates
 * an English UI out of habit, and the mentor reading a student's English who
 * wants it left exactly as typed.
 *
 * Resolution order, and why:
 *   1. content_language  an explicit answer to this exact question
 *   2. uiLang            the overwhelmingly common case, and a good default —
 *                        somebody reading a French interface wants French
 *
 * `preferred_language` does not appear here because it has already been folded
 * into `uiLang` by then: AuthProvider hands it to adoptProfileLanguage(), which
 * applies it as the UI language. Reading it again would double-count it.
 *
 * `autoTranslate` is the off switch, and it defaults to ON. A hackathon has to
 * work with nobody having configured anything.
 */
export interface ContentLanguage {
  /** The target language for member-written text. */
  lang: UiLang
  /** False when the reader has asked to see everything exactly as it was typed. */
  autoTranslate: boolean
}

export function useContentLanguage(): ContentLanguage {
  const { uiLang } = useLanguage()
  const { profile } = useAuth()

  const override = profile?.content_language
  // `!== false` rather than `?? true`: the column is NOT NULL DEFAULT true, but
  // a client running ahead of migration 100 sees `undefined`, and that has to
  // read as on rather than off.
  const autoTranslate = profile?.auto_translate !== false

  return useMemo(
    () => ({
      lang: isUiLang(override) ? override : uiLang,
      autoTranslate,
    }),
    [override, uiLang, autoTranslate]
  )
}
