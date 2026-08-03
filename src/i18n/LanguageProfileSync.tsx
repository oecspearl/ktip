import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from './LanguageContext'
import { PSEUDO_LANG, adoptProfileLanguage, getLangSource } from './language'

/**
 * Carries the language choice between the device and the profile, in both
 * directions.
 *
 * Migration 097 added `profiles.preferred_language` and `language.ts` has always
 * exported `adoptProfileLanguage()` to consume it — but nothing ever called it,
 * so the column was written by no one and read by no one. This is the missing
 * wire, and it is what makes a member who picks French on their laptop land in
 * French on their phone.
 *
 * It renders nothing and lives here rather than inside AuthProvider for a
 * structural reason: LanguageProvider sits ABOVE AuthProvider (a language switch
 * must not tear down the session), so the profile cannot be passed down as a
 * prop. It has to travel imperatively, through the module singleton.
 */
export function LanguageProfileSync() {
  const { profile, updateProfile } = useAuth()
  const { lang } = useLanguage()

  // ---- profile -> device -------------------------------------------------
  // adoptProfileLanguage() declines when the reader has already chosen on this
  // device, and when the value already matches, so this is safe to re-run. It
  // has to be, because LanguageProvider remounts this component on every switch.
  useEffect(() => {
    adoptProfileLanguage(profile?.preferred_language)
  }, [profile?.preferred_language])

  // ---- device -> profile -------------------------------------------------
  // Only an EXPLICIT choice is written back. A navigator guess must stay a
  // guess: persisting it would turn "this browser happens to be set to French"
  // into a permanent, cross-device decision the member never made — and then
  // adoptProfileLanguage() would faithfully reapply it everywhere.
  const written = useRef<string | null>(null)

  useEffect(() => {
    if (!profile) return
    // A diagnostic locale, not a language. Persisting it would ship a developer's
    // debugging session to their phone.
    if (lang === PSEUDO_LANG) return
    const source = getLangSource()
    if (source !== 'stored' && source !== 'url') return
    if (profile.preferred_language === lang) return
    // Guards a re-entrant write while the invalidated profile query is in
    // flight: until it settles, `profile.preferred_language` still holds the old
    // value and this effect would otherwise fire again on the next render.
    if (written.current === lang) return

    written.current = lang
    // Fire-and-forget. This is a convenience for the member's OTHER devices;
    // failing it must not raise a toast on the one in front of them, where the
    // language has already changed and localStorage has already remembered it.
    void updateProfile({ preferred_language: lang }).catch(() => {
      written.current = null
    })
  }, [profile, lang, updateProfile])

  return null
}
