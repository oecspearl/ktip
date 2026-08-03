import { useEffect, useRef, useState } from 'react'
import { Check, Globe } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { cn } from '@/lib/utils'
import { DropdownPanel } from './DropdownPanel'
import { useLanguage } from '@/i18n/LanguageContext'
import { LANGUAGE_NAMES, SELECTABLE_LANGS } from '@/i18n/language'

/**
 * The language picker.
 *
 * Each option is labelled with its ENDONYM — "Français", not "French". Someone
 * who cannot read the current interface language can still find their own; the
 * translated name is exactly the thing they cannot read.
 *
 * Deliberately not a native <select>: the control has to be recognisable at a
 * glance to someone who cannot read the surrounding copy, and a globe plus a
 * two-letter code reads as "language" in every language.
 */
export function LanguageSwitcher({
  className,
  align = 'end',
  direction = 'up',
  compact = false,
}: {
  className?: string
  align?: 'start' | 'end'
  /** 'up' for the footer, 'down' for the navbar. */
  direction?: 'up' | 'down'
  /** Icon only, no language code — for the navbar, where width is contested. */
  compact?: boolean
}) {
  const { lang, uiLang, setLang } = useLanguage()
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t`Change language`}
        title={LANGUAGE_NAMES[uiLang]}
        className={cn(
          'flex items-center gap-2 rounded-lg text-white/80 transition-all duration-200 hover:text-ktip-nav-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
          compact ? 'p-2 hover:scale-125' : 'px-2.5 py-1.5 text-sm hover:bg-white/10 hover:text-white'
        )}
      >
        <Globe size={compact ? 20 : 16} aria-hidden="true" />
        {!compact && <span className="font-medium uppercase tracking-wide">{uiLang}</span>}
        {/* The current language still has to be announced when the code is
            hidden, or the control reads as an unlabelled globe. */}
        {compact && <span className="sr-only">{LANGUAGE_NAMES[uiLang]}</span>}
      </button>

      {/* DropdownPanel rather than `{open && …}`: it is what every other popover
          in the nav uses, so this one enters and — more to the point — EXITS
          with the same motion, and it inherits the app's reduced-motion
          handling instead of reimplementing it. The ktip-cream/sand tokens
          invert under html.dark, so the panel follows the theme without a
          single dark: variant. */}
      <DropdownPanel
        open={open}
        className={cn(
          'absolute z-dropdown min-w-44 overflow-hidden rounded-xl border border-ktip-sand-100 bg-ktip-cream py-1 shadow-hard',
          direction === 'up' ? 'dropdown-panel--up bottom-full mb-2' : 'top-full mt-2',
          align === 'end' ? 'right-0' : 'left-0',
          direction === 'up'
            ? align === 'end'
              ? 'origin-bottom-right'
              : 'origin-bottom-left'
            : align === 'end'
              ? 'origin-top-right'
              : 'origin-top-left'
        )}
      >
        {/* translate="no": the endonyms are the one piece of text a BROWSER
            page-translator must never touch — "Français" fed through Edge's
            translate-to-English comes back as "English", which puts two
            "English" rows in the menu and hides French entirely. The pseudo
            locale is deliberately NOT listed; it stays reachable in dev via
            ?lang=pseudo without a menu row that machine-translates into
            nonsense ("Nickname (dev)"). */}
        <ul role="listbox" aria-label={t`Language`} translate="no">
          {SELECTABLE_LANGS.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === lang}
                onClick={() => {
                  setLang(option)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-ktip-sand-50',
                  option === lang
                    ? 'font-semibold text-ktip-ocean-600'
                    : 'text-ktip-sand-800'
                )}
              >
                {/* lang= on the option itself, so a screen reader pronounces
                    "Français" with a French voice rather than reading it as
                    mangled English. */}
                <span lang={option}>{LANGUAGE_NAMES[option]}</span>
                {option === lang && <Check size={14} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      </DropdownPanel>
    </div>
  )
}
