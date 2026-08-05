/**
 * Accents reach the calendar as Tailwind classes (`bg-ktip-ocean-500`), and a
 * class cannot be a gradient stop. Every one of them is backed by a theme
 * variable of the same name, though, so the class maps straight onto
 * `var(--color-…)` — including the stock palette, which index.css re-points in
 * dark mode. Reading the colour this way means the gradients inherit the theme
 * flip for free instead of freezing a hex.
 */
export function accentVar(dotClass: string | undefined): string | null {
  if (!dotClass) return null
  const match = /^bg-([a-z0-9-]+)$/.exec(dotClass.trim())
  return match ? `var(--color-${match[1]})` : null
}

/** Mixes an accent toward the card surface — how a finished item drains. */
export function drainAccent(color: string, keep = 42): string {
  return `color-mix(in srgb, ${color} ${keep}%, var(--color-ktip-cream))`
}

/**
 * The soft wash that bleeds right out of a row's colour bar, so the bar reads
 * as the edge of a tint rather than as a stripe glued to a white box.
 *
 * Kept faint on purpose: the row's job is to be read, and anything past a few
 * percent starts competing with the title for contrast.
 */
export function accentWash(dotClass: string | undefined, past = false): string | undefined {
  const color = accentVar(dotClass)
  if (!color) return undefined
  const strength = past ? 5 : 14
  return (
    `linear-gradient(90deg, color-mix(in srgb, ${color} ${strength}%, transparent) 0%, ` +
    `color-mix(in srgb, ${color} ${Math.round(strength / 3)}%, transparent) 38%, ` +
    'transparent 72%)'
  )
}
