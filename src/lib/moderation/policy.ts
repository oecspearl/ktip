import type { ModerationCategory, ModerationSurface, ScanResult, Severity } from './types'

/**
 * Which categories may hard-block a submit, and where.
 *
 * The naive rule — "medium and high block everywhere" — breaks the platform on
 * day one. 065 grades its phone-number regex `(\+?\d[\d\s().-]{7,}\d)` as
 * medium, and that pattern matches 1,234,567.89 and most invoice numbers. A
 * grant application with a budget table would be unsubmittable.
 *
 * So abuse blocks everywhere, and the two categories that are contextual —
 * a phone number, a promotional link — only block where the context makes them
 * dangerous: a private conversation, where the threat model is a stranger
 * pulling a minor off-platform. In a public project description the same
 * string is usually a budget line, and a warning is the proportionate answer.
 *
 * Mirrored in moderate_content() by 114. Change both or neither.
 */
const ALWAYS_BLOCKING: ReadonlySet<ModerationCategory> = new Set<ModerationCategory>([
  'hate_harassment',
  'bullying',
  'nsfw',
  'grooming_risk',
])

/** Surfaces where a private message is being written to a specific person. */
const PRIVATE_SURFACES: ReadonlySet<ModerationSurface> = new Set<ModerationSurface>([
  'message',
  'venue_room_message',
])

/** A match with no category at all is treated as abuse — fail safe, not open. */
export function blocksOn(
  category: ModerationCategory | null,
  surface: ModerationSurface
): boolean {
  if (category === null) return true
  if (ALWAYS_BLOCKING.has(category)) return true
  return PRIVATE_SURFACES.has(surface)
}

/**
 * Does this scan stop a submit?
 *
 * Only raw matches count (a normalized match would sail through
 * scan_content(), and blocking content the server accepts strands the member
 * with a draft they can neither publish nor understand).
 */
export function isBlocking(result: ScanResult, surface: ModerationSurface): boolean {
  return result.matches.some(
    (m) =>
      m.via === 'raw' &&
      (m.severity === 'medium' || m.severity === 'high') &&
      blocksOn(m.category, surface)
  )
}

/** Worst severity among matches that actually block on this surface. */
export function blockingSeverity(
  result: ScanResult,
  surface: ModerationSurface
): Severity | null {
  let worst: Severity | null = null
  for (const m of result.matches) {
    if (m.via !== 'raw') continue
    if (m.severity !== 'medium' && m.severity !== 'high') continue
    if (!blocksOn(m.category, surface)) continue
    if (worst !== 'high') worst = m.severity === 'high' ? 'high' : worst ?? 'medium'
  }
  return worst
}
