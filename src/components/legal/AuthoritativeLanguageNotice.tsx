import { Languages } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useLanguage } from '../../i18n/LanguageContext'
import { cn } from '../../lib/utils'

/**
 * Says which language version governs, on every legal page.
 *
 * Rendered unconditionally rather than only in fr/es. A reader in English needs
 * to know that the text in front of them is the operative one just as much as a
 * reader in French needs to know that theirs is not — and a notice that appears
 * only in some locales reads as a disclaimer bolted onto the translation rather
 * than as a statement about the document.
 *
 * The whole set is machine-assisted and human-reviewed, but the legal effect
 * follows a single text. That has to be visible before the first clause, not in
 * a footnote after the sixteenth.
 */
export function AuthoritativeLanguageNotice({ className }: { className?: string }) {
  const { i18n } = useLingui()
  const { setLang } = useLanguage()
  const isEnglish = i18n.locale === 'en'

  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2.5 rounded-surface border border-ktip-sand-200 bg-ktip-sand-50 px-4 py-3 text-caption text-ktip-sand-600',
        className
      )}
    >
      <Languages size={15} aria-hidden className="mt-0.5 shrink-0 text-ktip-sand-500" />
      <p className="leading-relaxed">
        {isEnglish ? (
          <Trans>This is the authoritative English text of this document.</Trans>
        ) : (
          <>
            <Trans>
              This translation is provided for convenience. The English version is the
              authoritative one, and it governs if the two differ.
            </Trans>{' '}
            <button
              type="button"
              onClick={() => setLang('en')}
              className="font-semibold text-ktip-ocean-700 underline underline-offset-2 hover:opacity-80"
            >
              <Trans>Read it in English</Trans>
            </button>
          </>
        )}
      </p>
    </div>
  )
}
