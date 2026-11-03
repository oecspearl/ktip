/**
 * Which KTIP page a copyright notice points at (185).
 *
 * A notice filed from the public form carries the URL the claimant pasted. The
 * moderator confirms the target before review, and this pre-fills the picker
 * from that URL so the common case is one click. Only the three page types a
 * takedown can hide from the console are recognised; anything else is picked
 * by hand.
 */

export type TakedownTargetType = 'resource' | 'project' | 'event'

export interface ParsedTakedownTarget {
  type: TakedownTargetType
  /** A uuid or a slug, as it appeared in the URL. */
  key: string
}

const SEGMENTS: Record<string, TakedownTargetType> = {
  resources: 'resource',
  projects: 'project',
  events: 'event',
}

/** Route words that sit where a slug would and are not one. */
const NOT_A_KEY = new Set(['new', 'edit', 'mine', 'my-submissions', 'submit'])

export function parseTakedownTarget(url: string | null | undefined): ParsedTakedownTarget | null {
  if (!url) return null
  let path: string
  try {
    path = new URL(url.trim(), 'https://ktip.invalid').pathname
  } catch {
    return null
  }
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const type = SEGMENTS[parts[0]]
  if (!type) return null
  const key = decodeURIComponent(parts[1])
  if (!key || NOT_A_KEY.has(key)) return null
  return { type, key }
}
