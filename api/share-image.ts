import sharp from 'sharp'
// `.js` on the relative imports: this route runs on Node as plain ES modules.
import { adminClientOrNull } from './_lib/require-permission.js'
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  DEFAULT_IMAGE_PATH,
  OG_KINDS,
  cleanId,
  loadShareable,
  rowImage,
  type OgKind,
} from './_lib/share-og.js'

/**
 * GET /api/share-image?kind=<kind>&id=<id or slug>&v=<version>
 *
 * The picture on a shared link's preview card, as a 1200×630 JPEG.
 *
 * Item photos are stored as WebP. Facebook copes, but LinkedIn and WhatsApp
 * drop a WebP og:image often enough to matter, and Facebook wants the size
 * stated up front to show the picture on the first share. So the card is
 * re-encoded here, once per photo: `v` changes when the photo does, and the
 * CDN keeps each version for a day.
 *
 * NOTE THE RUNTIME: Node, for sharp. Exported as GET, not default, for the
 * reason given in api/venue/room-recording.ts.
 *
 * The photo address never comes from the query. The row is loaded and checked
 * the same way api/share.ts does it, and only a picture in this project's own
 * Supabase storage is fetched. Anything that goes wrong sends the crawler to
 * the plain KTIP card instead.
 */

export const config = { runtime: 'nodejs', maxDuration: 15 }

const MAX_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT = 5_000

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

/** Photos fill the card; a business logo sits whole on white, since cropping a logo ruins it. */
export async function renderCard(kind: OgKind, picture: Buffer): Promise<Buffer> {
  const source = sharp(picture, { limitInputPixels: 40_000_000 }).rotate()
  if (kind !== 'org') {
    return source
      .resize(CARD_WIDTH, CARD_HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()
  }
  const logo = await source
    .resize(Math.round(CARD_WIDTH * 0.6), Math.round(CARD_HEIGHT * 0.6), {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer()
  return sharp({
    create: { width: CARD_WIDTH, height: CARD_HEIGHT, channels: 3, background: '#ffffff' },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const kind = params.get('kind') as OgKind
  if (!(OG_KINDS as readonly string[]).includes(kind)) return fallback()
  const id = cleanId(kind, params.get('id'))
  const admin = adminClientOrNull()
  if (!id || !admin) return fallback()

  try {
    const row = await loadShareable(admin, kind, id)
    const url = row ? rowImage(kind, row) : null
    const picture = url ? await fetchPicture(url) : null
    if (!picture) return fallback()
    const jpeg = await renderCard(kind, picture)
    return new Response(new Uint8Array(jpeg), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpeg.byteLength),
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    console.error('[share-image] failed', kind, id, err)
    return fallback()
  }
}
