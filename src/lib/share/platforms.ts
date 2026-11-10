/**
 * Where each share button goes, and what it can carry.
 *
 * Every app takes a link; only some take a message. WhatsApp and X open with
 * the message filled in. Facebook forbids a pre-filled message by policy, and
 * LinkedIn's share URL takes only the link, so for those two the sheet copies
 * the message and tells the member to paste it.
 *
 * LinkedIn does have an undocumented composer address that takes text
 * (feed/?shareActive=true&text=), but the preview card is built from a link
 * typed in that text, so the post opened with the address written out above
 * the card. Delon preferred the clean card, as Facebook shows it.
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

/** Platforms whose share URL drops the message; the sheet copies it and says to paste it. */
export const COPIES_MESSAGE: ReadonlySet<SharePlatform> = new Set(['linkedin', 'facebook', 'instagram'])

/** X counts every link as this many characters, whatever its length. */
export const X_LINK_CHARS = 23
export const X_LIMIT = 280

/**
 * Apps that keep the first preview they build for an address and reuse it for
 * days. Their links get a share stamp (?s=), so each share is an address they
 * haven't seen and they read the card fresh. None of them show the link in
 * the post (a card for LinkedIn and Facebook, t.co on X), so the stamp stays
 * out of sight. WhatsApp and email show the link, so theirs stays short.
 */
export const FRESH_LINK: ReadonlySet<SharePlatform> = new Set(['linkedin', 'facebook', 'x'])

/**
 * The link as shared: tagged with the app it went out on, so visits can be
 * counted per app later, and with the sharer's language when it isn't English
 * (index.html honours ?lang= before first paint). Existing query and hash are
 * kept.
 */
export function taggedUrl(url: string, source: SharePlatform, lang?: string, now = Date.now()): string {
  const u = new URL(url)
  u.searchParams.set('utm_source', source === 'native' ? 'share' : source)
  u.searchParams.set('utm_medium', 'share')
  if (lang && lang !== 'en') u.searchParams.set('lang', lang)
  if (FRESH_LINK.has(source)) u.searchParams.set('s', now.toString(36))
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
