/**
 * Video links: which ones KTIP accepts, and how they become a player.
 *
 * One rule for every form that takes a video link — the project form and the
 * grant wizard both validate with `isSupportedVideoLink`, so an applicant and a
 * project owner are told the same thing about the same link.
 *
 * `toVideoEmbed` builds the iframe src from a parsed, pattern-checked ID and a
 * fixed provider origin. The pasted URL itself never reaches an iframe: a link
 * that merely sits on an allowed host but does not parse into a known player
 * shape gets the open-in-a-new-tab fallback instead.
 */
import { msg } from '@lingui/core/macro'

export type VideoProvider = 'loom' | 'drive' | 'youtube' | 'vimeo'

export const VIDEO_LINK_MAX_LENGTH = 500

/** Shown by both forms when `isSupportedVideoLink` says no. */
export const VIDEO_LINK_ERROR = msg`Use a Loom, Google Drive, YouTube or Vimeo link, starting with https://`

/** Exact hostnames, not suffixes — `loom.com.example` is not Loom. */
const PROVIDER_HOSTS: Record<VideoProvider, readonly string[]> = {
  loom: ['loom.com', 'www.loom.com'],
  drive: ['drive.google.com'],
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  vimeo: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
}

const LOOM_ID = /^[A-Za-z0-9]{10,64}$/
const DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^\d{1,15}$/
const VIMEO_HASH = /^[A-Za-z0-9]{6,32}$/

export interface VideoEmbed {
  provider: VideoProvider
  /** Ready for an iframe src; always https on the provider's player origin. */
  src: string
}

function parseLink(url: string): URL | null {
  const trimmed = url.trim()
  if (!trimmed || trimmed.length > VIDEO_LINK_MAX_LENGTH) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  // A link with credentials in it is not a share link anyone meant to paste.
  if (parsed.username || parsed.password) return null
  return parsed
}

function providerOfHost(hostname: string): VideoProvider | null {
  for (const provider of Object.keys(PROVIDER_HOSTS) as VideoProvider[]) {
    if (PROVIDER_HOSTS[provider].includes(hostname)) return provider
  }
  return null
}

/** Which provider a link belongs to, or null for any other host. */
export function videoProviderOf(url: string): VideoProvider | null {
  const parsed = parseLink(url)
  return parsed ? providerOfHost(parsed.hostname) : null
}

/**
 * The acceptance rule: http(s), on a Loom, Google Drive, YouTube or Vimeo
 * host, at most 500 characters. A Drive folder link passes — the grant help
 * text has always allowed "the folder holding it" — and opens in a new tab
 * rather than a player.
 */
export function isSupportedVideoLink(url: string): boolean {
  return videoProviderOf(url) !== null
}

function segmentsOf(parsed: URL): string[] {
  return parsed.pathname.split('/').filter(Boolean)
}

function loomEmbed(parsed: URL): string | null {
  const segs = segmentsOf(parsed)
  const at = segs.findIndex((s) => s === 'share' || s === 'embed')
  const raw = at >= 0 ? segs[at + 1] : undefined
  if (!raw) return null
  // Share links can carry a title slug before the ID: Demo-walkthrough-<32 hex>.
  const id = raw.match(/([0-9a-f]{32})$/i)?.[1] ?? raw
  return LOOM_ID.test(id) ? `https://www.loom.com/embed/${id}` : null
}

function driveEmbed(parsed: URL): string | null {
  const segs = segmentsOf(parsed)
  let id: string | null = null
  if (segs.includes('file')) {
    // /file/d/<id>/view, and the signed-in variant /file/u/0/d/<id>/view
    const at = segs.indexOf('d')
    id = at >= 0 ? segs[at + 1] ?? null : null
  } else if (segs[0] === 'open' || segs[0] === 'uc') {
    id = parsed.searchParams.get('id')
  }
  return id && DRIVE_ID.test(id) ? `https://drive.google.com/file/d/${id}/preview` : null
}

function youtubeEmbed(parsed: URL): string | null {
  const segs = segmentsOf(parsed)
  let id: string | null = null
  if (parsed.hostname === 'youtu.be') {
    id = segs[0] ?? null
  } else if (segs[0] === 'watch') {
    id = parsed.searchParams.get('v')
  } else if (['shorts', 'embed', 'live', 'v'].includes(segs[0] ?? '')) {
    id = segs[1] ?? null
  }
  if (!id || !YOUTUBE_ID.test(id)) return null

  // Keep a shared timestamp: ?t=90 or ?t=90s. Anything fancier starts at 0.
  const t = parsed.searchParams.get('t') ?? parsed.searchParams.get('start')
  const start = t?.match(/^(\d{1,6})s?$/)?.[1]
  return `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`
}

function vimeoEmbed(parsed: URL): string | null {
  const segs = segmentsOf(parsed)
  let id: string | undefined
  let hash: string | null = parsed.searchParams.get('h')
  if (parsed.hostname === 'player.vimeo.com') {
    id = segs[0] === 'video' ? segs[1] : undefined
  } else {
    // vimeo.com/<id>, vimeo.com/<id>/<hash> (unlisted), vimeo.com/channels/x/<id>
    const at = segs.findIndex((s) => VIMEO_ID.test(s))
    if (at >= 0) {
      id = segs[at]
      hash = hash ?? segs[at + 1] ?? null
    }
  }
  if (!id || !VIMEO_ID.test(id)) return null
  const h = hash && VIMEO_HASH.test(hash) ? `?h=${hash}` : ''
  return `https://player.vimeo.com/video/${id}${h}`
}

/**
 * The player for a link, or null when the link cannot play inside the page —
 * another host, a Drive folder, a channel page, a malformed ID.
 */
export function toVideoEmbed(url: string): VideoEmbed | null {
  const parsed = parseLink(url)
  if (!parsed) return null
  const provider = providerOfHost(parsed.hostname)
  if (!provider) return null

  const src =
    provider === 'loom'
      ? loomEmbed(parsed)
      : provider === 'drive'
        ? driveEmbed(parsed)
        : provider === 'youtube'
          ? youtubeEmbed(parsed)
          : vimeoEmbed(parsed)

  return src ? { provider, src } : null
}
