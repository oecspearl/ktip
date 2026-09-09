import { useId } from 'react'
import { cn } from '@/lib/utils'
import type { Lang } from '@/i18n/language'

/**
 * A flag for each interface language, as inline SVG.
 *
 * Inline rather than emoji on purpose: Windows ships no flag glyphs, so 🇫🇷
 * renders there as the letters "FR" — on exactly the machines most members
 * use. Inline rather than a flag library because three flags do not justify
 * a dependency that carries two hundred and fifty.
 *
 * A language is not a country, and the choice here is the conventional one
 * rather than a claim: the Union flag for English, the tricolore for French,
 * the rojigualda (without its arms, which are illegible at 20px) for Spanish.
 * The endonym next to it stays the thing a reader actually identifies.
 *
 * Always decorative — the caller labels the option with the language name.
 */
export function LanguageFlag({
  lang,
  className,
}: {
  lang: Lang
  className?: string
}) {
  // The Union flag needs a clipPath, and clipPath ids are document-global.
  const clipId = useId()
  const svgClass = cn('h-[15px] w-5 shrink-0 rounded-[3px] ring-1 ring-black/10', className)

  if (lang === 'fr') {
    return (
      <svg viewBox="0 0 3 2" className={svgClass} aria-hidden="true" focusable="false">
        <rect width="1" height="2" fill="#002395" />
        <rect x="1" width="1" height="2" fill="#fff" />
        <rect x="2" width="1" height="2" fill="#ed2939" />
      </svg>
    )
  }

  if (lang === 'es') {
    return (
      <svg viewBox="0 0 3 2" className={svgClass} aria-hidden="true" focusable="false">
        <rect width="3" height="2" fill="#aa151b" />
        <rect y="0.5" width="3" height="1" fill="#f1bf00" />
      </svg>
    )
  }

  // 'en' and the dev-only pseudo locale, which maps onto English.
  return (
    <svg viewBox="0 0 60 30" className={svgClass} aria-hidden="true" focusable="false">
      <clipPath id={clipId}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${clipId})`} stroke="#c8102e" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  )
}
