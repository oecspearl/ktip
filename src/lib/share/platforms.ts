/**
 * Where each share button goes, and what it can carry.
 *
 * Every app takes a link; only some take a message. WhatsApp and X accept a
 * pre-filled message. Facebook forbids it by policy and LinkedIn's share URL
 * ignores it, so the sheet copies the message for those two and says so.
 * Instagram has no web share URL at all.
 */

export type SharePlatform =
  | 'whatsapp'
  | 'linkedin'
  | 'facebook'
  | 'x'
  | 'instagram'
  | 'email'
  | 'copy'
  | 'native'

/** Platforms whose share URL drops the message; the sheet copies it first. */
export const COPIES_MESSAGE: ReadonlySet<SharePlatform> = new Set(['linkedin', 'facebook', 'instagram'])

/** X counts every link as this many characters, whatever its length. */
export const X_LINK_CHARS = 23
export const X_LIMIT = 280

/**
 * The link as shared: tagged with the app it went out on, so visits can be
 * counted per app later, and with the sharer's language when it isn't English
 * (index.html honours ?lang= before first paint). Existing query and hash are
 * kept.
 */
export function taggedUrl(url: string, source: SharePlatform, lang?: string): string {
  const u = new URL(url)
  u.searchParams.set('utm_source', source === 'native' ? 'share' : source)
  u.searchParams.set('utm_medium', 'share')
  if (lang && lang !== 'en') u.searchParams.set('lang', lang)
  return u.toString()
}

/** Characters X will count for this message plus the link it attaches. */
export function xLength(message: string): number {
  return [...message.trim()].length + (message.trim() ? 1 : 0) + X_LINK_CHARS
}

/**
 * The address a share button opens, or null for platforms with none
 * (Instagram, copy, the phone's own share menu).
 */
export function shareHref(
  platform: SharePlatform,
  { url, message, title }: { url: string; message: string; title: string }
): string | null {
  const enc = encodeURIComponent
  const text = message.trim()
  switch (platform) {
    case 'whatsapp':
      return `https://wa.me/?text=${enc(text ? `${text}\n\n${url}` : url)}`
    case 'x':
      return `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`
    case 'email':
      return `mailto:?subject=${enc(title)}&body=${enc(text ? `${text}\n\n${url}` : url)}`
    default:
      return null
  }
}
