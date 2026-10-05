/**
 * Social links (migration 169) — profiles.social_links.
 *
 * A small fixed set of networks, each one full https URL. The database refuses
 * any other key and anything that is not https (profile_social_links_valid), so
 * the page can render every value as a link without second-guessing it.
 */

export const SOCIAL_KEYS = ['linkedin', 'x', 'instagram', 'facebook', 'github'] as const
export type SocialKey = (typeof SOCIAL_KEYS)[number]
export type SocialLinks = Partial<Record<SocialKey, string>>

/** Brand names — deliberately untranslated. */
export const SOCIAL_LABELS: Record<SocialKey, string> = {
  linkedin: 'LinkedIn',
  x: 'X',
  instagram: 'Instagram',
  facebook: 'Facebook',
  github: 'GitHub',
}

/** What the editor's field shows before anything is typed. */
export const SOCIAL_PLACEHOLDERS: Record<SocialKey, string> = {
  linkedin: 'https://www.linkedin.com/in/your-name',
  x: 'https://x.com/your-handle',
  instagram: 'https://www.instagram.com/your-handle',
  facebook: 'https://www.facebook.com/your-page',
  github: 'https://github.com/your-handle',
}

const MAX_URL = 300

/** Read whatever the column holds; anything not a valid https link is dropped. */
export function parseSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const v = value as Record<string, unknown>
  const out: SocialLinks = {}
  for (const key of SOCIAL_KEYS) {
    const url = v[key]
    if (typeof url === 'string' && url.startsWith('https://') && url.length <= MAX_URL) out[key] = url
  }
  return out
}

/**
 * Tidy what a member typed: trim, add https:// to a bare domain, drop empties.
 * Returns null for a value that cannot be made into an https link, so the form
 * can say which field is wrong instead of the database refusing the whole save.
 */
export function normaliseSocialUrl(raw: string): string | null | '' {
  const value = raw.trim()
  if (!value) return ''
  const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`
  if (!withScheme.startsWith('https://') || withScheme.length > MAX_URL) return null
  try {
    const url = new URL(withScheme)
    return url.hostname.includes('.') ? url.toString() : null
  } catch {
    return null
  }
}

/** Entries in display order, for rendering. */
export function socialEntries(links: SocialLinks): { key: SocialKey; label: string; url: string }[] {
  return SOCIAL_KEYS.filter((k) => links[k]).map((k) => ({ key: k, label: SOCIAL_LABELS[k], url: links[k]! }))
}
