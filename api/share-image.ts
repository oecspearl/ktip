import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
// `.js` on the relative imports: this route runs on Node as plain ES modules.
import { adminClientOrNull } from './_lib/require-permission.js'
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  DEFAULT_IMAGE_PATH,
  KIND_LABEL,
  OG_KINDS,
  cardFacts,
  cleanId,
  loadShareable,
  rowImage,
  rowTitle,
  type OgKind,
} from './_lib/share-og.js'

/**
 * GET /og/<kind>/<id or slug>.jpg?v=<version>
 * (vercel.json rewrites it to /api/share-image?kind=<kind>&id=<id>)
 *
 * The picture on a shared link's preview card: a 1200×630 JPEG of the item's
 * photo with a band along the bottom carrying the kind ("EVENT"), the title,
 * the facts people decide on (dates and place, award and closing date) and the
 * KTIP logo. Facebook shows the picture and title but drops the description,
 * so the facts go on the picture, where every app shows them.
 *
 * Item photos are stored as WebP. LinkedIn and WhatsApp drop a WebP og:image
 * often enough to matter, and Facebook wants the size stated up front, so the
 * card is always a JPEG at the size the tags promise. `v` changes when
 * anything drawn on it does, and the CDN keeps each version for a day.
 *
 * NOTE THE RUNTIME: Node, for sharp. Exported as GET, not default, for the
 * reason given in api/venue/room-recording.ts.
 *
 * Text is drawn by sharp (Pango) in Liberation Sans, bundled in api/_assets
 * (vercel.json includeFiles) because a function has no system fonts. If the
 * band can't be drawn, the card goes out as the plain photo rather than not at
 * all.
 *
 * The photo address never comes from the query. The row is loaded and checked
 * the same way api/share.ts does it, and only a picture in this project's own
 * Supabase storage is fetched. Items without one use the bundled hero photo.
 */

export const config = { runtime: 'nodejs', maxDuration: 15 }

const MAX_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT = 5_000

const ASSETS = join(process.cwd(), 'api', '_assets')
const BOLD = join(ASSETS, 'LiberationSans-Bold.ttf')
const REGULAR = join(ASSETS, 'LiberationSans-Regular.ttf')

const NAVY = '#041E42'
const GREEN = '#97D700'
const PAD = 56
const BADGE = 112

/**
 * A function has no /etc/fonts, so fontconfig is pointed at the bundled fonts
 * before the first text is drawn. It reads the variable once, on first use.
 */
function prepareFonts() {
  if (process.env.FONTCONFIG_FILE) return
  const dir = join(tmpdir(), 'ktip-fontconfig')
  const file = join(dir, 'fonts.conf')
  if (!existsSync(file)) {
    mkdirSync(join(dir, 'cache'), { recursive: true })
    writeFileSync(
      file,
      `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><dir>${ASSETS}</dir><cachedir>${join(dir, 'cache')}</cachedir></fontconfig>\n`
    )
  }
  process.env.FONTCONFIG_FILE = file
}

const fallback = () =>
  new Response(null, {
    status: 302,
    headers: { Location: DEFAULT_IMAGE_PATH, 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  })

function storageHost(): string | null {
  try {
    return new URL(process.env.VITE_SUPABASE_URL || '').host || null
  } catch {
    return null
  }
}

async function fetchPicture(url: string): Promise<Buffer | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const host = storageHost()
  if (parsed.protocol !== 'https:' || !host || parsed.host !== host) return null

  const res = await fetch(parsed, { signal: AbortSignal.timeout(FETCH_TIMEOUT), redirect: 'error' })
  if (!res.ok || !res.body) return null
  if (!(res.headers.get('content-type') || '').startsWith('image/')) return null
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) return null

  const chunks: Uint8Array[] = []
  let size = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

let hero: Buffer | null = null
let logo: Buffer | null = null
const asset = (name: string) => readFileSync(join(ASSETS, name))

// ---- text -------------------------------------------------------------------

/** Pango markup is XML: the title is user text. */
const markup = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

interface TextStyle {
  bold: boolean
  size: number
  color: string
  width: number
  spacing?: number
}

interface Drawn {
  data: Buffer
  width: number
  height: number
}

async function drawText(text: string, s: TextStyle): Promise<Drawn> {
  const span = `<span foreground="${s.color}"${s.spacing ? ` letter_spacing="${s.spacing}"` : ''}>${markup(text)}</span>`
  const { data, info } = await sharp({
    text: {
      text: span,
      font: `Liberation Sans ${s.bold ? 'Bold ' : ''}${s.size}`,
      fontfile: s.bold ? BOLD : REGULAR,
      width: s.width,
      wrap: 'word',
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

const heights = new Map<string, number>()

/**
 * The tallest a block of `lines` lines can be in this style, measured once.
 * Measured rather than computed: Pango's line spacing isn't the font size.
 */
async function maxHeight(s: TextStyle, lines: number): Promise<number> {
  const key = `${s.bold}:${s.size}:${lines}`
  if (!heights.has(key)) {
    const sample = Array.from({ length: lines }, () => 'Hg').join('\n')
    heights.set(key, (await drawText(sample, { ...s, width: 2000 })).height + 2)
  }
  return heights.get(key)!
}

/** Draws the text in at most `lines` lines; if it runs over, the most words that fit, then "…". */
async function fitText(text: string, s: TextStyle, lines: number): Promise<Drawn> {
  const limit = await maxHeight(s, lines)
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const cut = (n: string[]) => `${n.join(' ').replace(/[,;:.·\s]+$/, '')}…`

  const whole = await drawText(words.join(' '), s)
  if (whole.height <= limit || words.length <= 1) return whole

  // Binary search on the number of words kept: a handful of renders, not one per word.
  let lo = 1
  let hi = words.length - 1
  let best = await drawText(cut(words.slice(0, 1)), s)
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const drawn = await drawText(cut(words.slice(0, mid)), s)
    if (drawn.height <= limit) {
      best = drawn
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

// ---- card -------------------------------------------------------------------

export interface CardText {
  label: string
  title: string
  facts: string[]
}

/** The photo, cropped to fill the card; a logo sits whole on white instead, since cropping a logo ruins it. */
async function base(kind: OgKind, picture: Buffer | null, top: number): Promise<Buffer> {
  if (kind === 'org' && picture) {
    const room = Math.max(160, top - 60)
    const mark = await sharp(picture, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(Math.round(CARD_WIDTH * 0.5), room, { fit: 'inside' })
      .png()
      .toBuffer({ resolveWithObject: true })
    return sharp({ create: { width: CARD_WIDTH, height: CARD_HEIGHT, channels: 3, background: '#ffffff' } })
      .composite([
        {
          input: mark.data,
          left: Math.round((CARD_WIDTH - mark.info.width) / 2),
          top: Math.max(24, Math.round((top - mark.info.height) / 2)),
        },
      ])
      .png()
      .toBuffer()
  }
  const photo = picture ?? (hero ??= asset('hero.jpg'))
  return sharp(photo, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer()
}

/** The plain photo, no band: what goes out if the text can't be drawn. */
async function plain(kind: OgKind, picture: Buffer | null): Promise<Buffer> {
  return sharp(await base(kind, picture, CARD_HEIGHT))
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer()
}

export async function renderCard(kind: OgKind, picture: Buffer | null, text: CardText): Promise<Buffer> {
  prepareFonts()
  const width = CARD_WIDTH - PAD * 2 - BADGE - 32

  const facts = text.facts.length
    ? await fitText(text.facts.join('  ·  '), { bold: false, size: 30, color: '#DCE6F2', width }, 1)
    : null
  const title = await fitText(text.title, { bold: true, size: 52, color: '#FFFFFF', width }, 2)
  const label = await drawText(text.label, { bold: true, size: 22, color: GREEN, width, spacing: 3072 })

  const factsTop = facts ? CARD_HEIGHT - PAD - facts.height : CARD_HEIGHT - PAD
  const titleTop = (facts ? factsTop - 14 : factsTop) - title.height
  const labelTop = titleTop - 16 - label.height
  const shadeTop = Math.max(0, labelTop - 120)
  const shadeHeight = CARD_HEIGHT - shadeTop

  const shade = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${shadeHeight}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${NAVY}" stop-opacity="0"/>
        <stop offset="0.4" stop-color="${NAVY}" stop-opacity="0.82"/>
        <stop offset="1" stop-color="${NAVY}" stop-opacity="0.95"/>
      </linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`
  )
  const badge = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE}" height="${BADGE}"><rect width="${BADGE}" height="${BADGE}" rx="22" fill="#ffffff"/></svg>`
  )
  const mark = await sharp((logo ??= asset('ktip-logo.png')))
    .resize(BADGE - 24, BADGE - 24, { fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true })
  const badgeLeft = CARD_WIDTH - PAD - BADGE
  const badgeTop = CARD_HEIGHT - PAD - BADGE

  const layers: OverlayOptions[] = [
    { input: shade, left: 0, top: shadeTop },
    { input: label.data, left: PAD, top: labelTop },
    { input: title.data, left: PAD, top: titleTop },
    ...(facts ? [{ input: facts.data, left: PAD, top: factsTop }] : []),
    { input: badge, left: badgeLeft, top: badgeTop },
    {
      input: mark.data,
      left: badgeLeft + Math.round((BADGE - mark.info.width) / 2),
      top: badgeTop + Math.round((BADGE - mark.info.height) / 2),
    },
  ]
  return sharp(await base(kind, picture, shadeTop))
    .composite(layers)
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()
}

/**
 * Crawlers ask for /og/<kind>/<id>.jpg (see cardImagePath); vercel.json
 * rewrites that here with kind and id in the query. Reading the path as well
 * keeps the route working if the query doesn't come through the rewrite.
 */
const CARD_PATH = /^\/og\/([a-z]+)\/([^/]+)\.jpg$/

export async function GET(request: Request): Promise<Response> {
  const { pathname, searchParams: params } = new URL(request.url)
  const fromPath = CARD_PATH.exec(pathname)
  const kind = (params.get('kind') ?? fromPath?.[1]) as OgKind
  if (!(OG_KINDS as readonly string[]).includes(kind)) return fallback()
  const id = cleanId(kind, params.get('id') ?? (fromPath ? decodeURIComponent(fromPath[2]) : null))
  const admin = adminClientOrNull()
  if (!id || !admin) return fallback()

  let jpeg: Buffer
  try {
    const row = await loadShareable(admin, kind, id)
    if (!row) return fallback()
    const url = rowImage(kind, row)
    const picture = url ? await fetchPicture(url).catch(() => null) : null
    try {
      jpeg = await renderCard(kind, picture, { label: KIND_LABEL[kind], title: rowTitle(kind, row), facts: cardFacts(kind, row) })
    } catch (err) {
      console.error('[share-image] band failed, sending the plain photo', kind, id, err)
      jpeg = await plain(kind, picture)
    }
  } catch (err) {
    console.error('[share-image] failed', kind, id, err)
    return fallback()
  }
  return new Response(new Uint8Array(jpeg), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(jpeg.byteLength),
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}

/**
 * Some crawlers check an image with HEAD before fetching it, and a 405 there
 * reads as "no image". Same answer as GET, without the body; the CDN caches
 * the GET it rides on.
 */
export async function HEAD(request: Request): Promise<Response> {
  const res = await GET(request)
  return new Response(null, { status: res.status, headers: res.headers })
}
