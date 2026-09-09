/**
 * Country name → ISO 3166-1 alpha-2, for the flag beside a member's location.
 *
 * `profiles.country` is TEXT and holds the English NAME (see countries.ts —
 * a code column there would orphan every profile already saved), so a flag
 * needs this lookup. The pairs are lifted from the `countries` table seeded in
 * migration 058, with the wider-Caribbean entries countries.ts offers but 058
 * did not seed, so the spellings cannot drift from the ones members actually
 * pick.
 *
 * **Anything not in this map has no flag, and that is a supported answer.**
 * A member from Kazakhstan gets their country's name and no picture; nothing
 * renders a broken image, and nobody is shown the wrong nation's flag because
 * a lookup guessed. Adding a country here means vendoring its SVG under
 * `public/flags/` in the same change (scripts/get-flags is the throwaway that
 * did the first forty).
 *
 * Why SVG files and not the flag emoji: Windows ships no flag glyphs, so 🇱🇨
 * renders there as the letters "LC" — on exactly the machines most members
 * use. The same reason LanguageFlag draws its three flags by hand.
 */

/** The vendored set. Keys are exactly the strings countries.ts offers. */
const CODE_BY_COUNTRY: Readonly<Record<string, string>> = {
  // OECS member states and associate members.
  'Antigua and Barbuda': 'ag',
  Anguilla: 'ai',
  'British Virgin Islands': 'vg',
  Dominica: 'dm',
  Grenada: 'gd',
  Guadeloupe: 'gp',
  Martinique: 'mq',
  Montserrat: 'ms',
  'Saint Kitts and Nevis': 'kn',
  'Saint Lucia': 'lc',
  'Saint Vincent and the Grenadines': 'vc',

  // The wider Caribbean.
  Aruba: 'aw',
  Bahamas: 'bs',
  Barbados: 'bb',
  Belize: 'bz',
  Bermuda: 'bm',
  'Cayman Islands': 'ky',
  Cuba: 'cu',
  Curaçao: 'cw',
  'Dominican Republic': 'do',
  Guyana: 'gy',
  Haiti: 'ht',
  Jamaica: 'jm',
  'Puerto Rico': 'pr',
  'Sint Maarten': 'sx',
  Suriname: 'sr',
  'Trinidad and Tobago': 'tt',
  'Turks and Caicos Islands': 'tc',
  'United States Virgin Islands': 'vi',

  // Where the diaspora is, per the same migration.
  Australia: 'au',
  Brazil: 'br',
  Canada: 'ca',
  China: 'cn',
  France: 'fr',
  Germany: 'de',
  India: 'in',
  Netherlands: 'nl',
  'South Africa': 'za',
  'United Kingdom': 'gb',
  'United States': 'us',
}

/**
 * The two-letter code for a country name, or null when there is no flag for
 * it. Tolerant of the whitespace and casing a hand-typed value can carry —
 * `profiles.country` has been free text for most of its life.
 */
export function countryCode(country: string | null | undefined): string | null {
  if (!country) return null
  const exact = CODE_BY_COUNTRY[country.trim()]
  if (exact) return exact
  const wanted = country.trim().toLowerCase()
  for (const [name, code] of Object.entries(CODE_BY_COUNTRY)) {
    if (name.toLowerCase() === wanted) return code
  }
  return null
}

/** Public URL of a country's flag, or null when it is not one we carry. */
export function countryFlagUrl(country: string | null | undefined): string | null {
  const code = countryCode(country)
  return code ? `/flags/${code}.svg` : null
}
