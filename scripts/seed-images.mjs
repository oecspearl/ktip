/**
 * Host the demo seed's photography in our own Storage, optimised.
 *
 * The seeds used to point image_url at images.unsplash.com directly. That
 * serves a JPEG sized by query string from someone else's CDN, and a photo
 * that is taken down there disappears from the demo with no error anywhere.
 *
 * This takes the picks in scripts/seed-images.json (one free Unsplash photo
 * per seeded event, project and resource, chosen to match that row), and for
 * each one:
 *
 *   1. downloads the original once (cached under node_modules/.tmp),
 *   2. encodes a WebP at most 1600 wide and about 200KB, plus the 640 wide `-640.webp`
 *      sibling that src/lib/upload-variants.ts derives from the original's
 *      URL, so cards get the small copy exactly as they do for a member upload,
 *   3. uploads both to a public bucket under seed/,
 *   4. points the row's image column at the new URL with a content `?v=`,
 *      which busts the original and the sibling together.
 *
 * Idempotent: re-running re-uploads in place and rewrites the same URL.
 *
 * Usage:
 *   node scripts/seed-images.mjs             # upload and update rows
 *   node scripts/seed-images.mjs --dry-run   # encode only, print sizes
 *   node scripts/seed-images.mjs --only=ev05,pr02
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 * Photos: Unsplash licence (free to use, no attribution required).
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/** Where each kind of row lives, which column holds its picture, which bucket. */
const TARGETS = {
  event: { table: 'events', column: 'image_url', bucket: 'event-images', dir: 'seed/events' },
  project: { table: 'projects', column: 'image_url', bucket: 'project-images', dir: 'seed/projects' },
  // resource-files is private, so thumbnails sit with the other public images.
  resource: { table: 'resources', column: 'thumbnail_url', bucket: 'document-images', dir: 'seed/resources' },
  // Portraits: square, with the 128 sibling every avatar consumer asks for.
  // A persona's portrait is also their speaker photo wherever they speak.
  avatar: { table: 'profiles', column: 'avatar_url', bucket: 'avatars', dir: 'seed/people', square: true },
  speaker: { table: 'event_speakers', column: 'photo_url', bucket: 'avatars', dir: 'seed/speakers', square: true },
}
const AVATAR_SIZE = 512
const AVATAR_SIBLING = 128 // AVATAR_VARIANT_WIDTH in src/lib/upload-variants.ts

// 1600 covers a full-bleed hero on a laptop; the 640 sibling covers every card.
const ORIGINAL_WIDTH = 1600
const SIBLING_WIDTH = 640 // COVER_VARIANT_WIDTH in src/lib/upload-variants.ts
// Busy frames (foliage, crowds, water) encode large. Step quality down until
// the original fits, the way the in-app uploader does, and stop at the floor.
const ORIGINAL_BUDGET = 200 * 1024
const QUALITY_LADDER = [80, 74, 68, 62, 56]
const CACHE = new URL('../node_modules/.tmp/seed-images/', import.meta.url)
mkdirSync(CACHE, { recursive: true })

const manifest = JSON.parse(readFileSync(new URL('./seed-images.json', import.meta.url), 'utf8'))
let done = 0

for (const item of manifest.items) {
  if (only && !only.has(item.key)) continue
  const target = TARGETS[item.kind]
  if (!target) throw new Error(`${item.key}: unknown kind ${item.kind}`)

  const source = await fetchOriginal(item.photo)
  const base = sharp(source, { failOn: 'none' }).rotate()
  // `attention` keeps the face in a square crop when it sits off-centre.
  const square = (size) => base.clone().resize(size, size, { fit: 'cover', position: 'attention' })
  const original = target.square
    ? await square(AVATAR_SIZE).webp({ quality: 80, effort: 6 }).toBuffer()
    : await encodeWithinBudget(base)
  const siblingWidth = target.square ? AVATAR_SIBLING : SIBLING_WIDTH
  const sibling = target.square
    ? await square(AVATAR_SIBLING).webp({ quality: 78, effort: 6 }).toBuffer()
    : await base
        .clone()
        .resize({ width: SIBLING_WIDTH, withoutEnlargement: true })
        .webp({ quality: 74, effort: 5 })
        .toBuffer()
  const version = createHash('sha1').update(original).digest('hex').slice(0, 8)
  const objectKey = `${target.dir}/${item.id}.webp`
  const siblingKey = `${target.dir}/${item.id}-${siblingWidth}.webp`

  if (dryRun) {
    console.log(`${item.key}: ${kb(source)} -> ${kb(original)} + ${kb(sibling)}  ${target.bucket}/${objectKey}`)
    continue
  }

  for (const [key, body] of [[objectKey, original], [siblingKey, sibling]]) {
    const { error } = await db.storage.from(target.bucket).upload(key, body, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    })
    if (error) fail(`${item.key} upload ${key}`, error)
  }

  const publicUrl = `${db.storage.from(target.bucket).getPublicUrl(objectKey).data.publicUrl}?v=${version}`
  const { data, error } = await db
    .from(target.table)
    .update({ [target.column]: publicUrl })
    .eq('id', item.id)
    .select('id')
  if (error) fail(`${item.key} row update`, error)
  if (!data?.length) console.log(`${item.key}: uploaded, but row ${item.id} is not in this database`)
  else console.log(`${item.key}: ${kb(original)} + ${kb(sibling)} -> ${target.table}.${target.column}`)
  if (item.kind === 'avatar' && item.speakerName) {
    const { error: speakerError } = await db
      .from('event_speakers')
      .update({ photo_url: publicUrl })
      .eq('name', item.speakerName)
    if (speakerError) fail(`${item.key} speaker photo`, speakerError)
  }
  done++
}

if (!dryRun) console.log(`\n${done} image${done === 1 ? '' : 's'} hosted.`)

async function encodeWithinBudget(base) {
  // Width before quality: a busy frame at q56 shows its blocks, while the
  // same frame 1280 wide at a decent quality still looks sharp in a hero.
  for (const width of [ORIGINAL_WIDTH, 1280]) {
    const resized = base.clone().resize({ width, withoutEnlargement: true })
    for (const quality of QUALITY_LADDER) {
      const out = await resized.clone().webp({ quality, effort: 6 }).toBuffer()
      if (out.length <= ORIGINAL_BUDGET || (width === 1280 && quality === QUALITY_LADDER.at(-1))) return out
      if (width === ORIGINAL_WIDTH && quality <= 62) break
    }
  }
}

async function fetchOriginal(photo) {
  const file = new URL(`${photo}.jpg`, CACHE)
  if (existsSync(file)) return readFileSync(file)
  const res = await fetch(`https://images.unsplash.com/${photo}?w=2400&q=90&fm=jpg`)
  if (!res.ok) throw new Error(`${photo}: download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(file, buf)
  return buf
}

function kb(buf) {
  return `${Math.round(buf.length / 1024)}KB`
}

function fail(what, error) {
  console.error(`failed on ${what}: ${error.message}`)
  process.exit(1)
}
