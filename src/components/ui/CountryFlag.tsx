import { countryFlagUrl } from '../../lib/country-flag'
import { cn } from '../../lib/utils'

interface CountryFlagProps {
  /** The country NAME as `profiles.country` holds it. */
  country: string | null | undefined
  className?: string
}

/**
 * The flag beside a country's name.
 *
 * Renders nothing when there is no flag for that country — see
 * `src/lib/country-flag.ts` for why that is a supported answer rather than a
 * gap to fill with a guess. The caller always prints the name too, so this is
 * decorative and carries no alt text: a screen reader that announced "Flag of
 * Saint Lucia, Saint Lucia" would be reading the same fact twice.
 *
 * A 4:3 SVG from `public/flags/`, lazily loaded, so a page fetches exactly one
 * — the member's. The hairline ring is what stops a flag with a white band
 * (Anguilla, Dominica's cross) dissolving into a cream card.
 */
export function CountryFlag({ country, className }: CountryFlagProps) {
  const src = countryFlagUrl(country)
  if (!src) return null

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      width={16}
      height={12}
      className={cn(
        'inline-block h-3 w-4 shrink-0 rounded-[2px] object-cover ring-1 ring-black/10',
        className
      )}
    />
  )
}
