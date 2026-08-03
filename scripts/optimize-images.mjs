// Generates responsive AVIF + WebP variants for the hero photography.
// Usage: node scripts/optimize-images.mjs   (wired to `prebuild`, so `npm run
// build` runs it automatically)
//
// Scope is the full-bleed photography only — public/hero, public/pages,
// public/grants and the standalone backdrop. The fixed-size marks (logo,
// reaction emoji) are a different problem with a different answer and live in
// scripts/optimize-brand-assets.mjs.
//
// Everything it writes goes to public/_img/, which is gitignored. Vite copies
// publicDir verbatim into dist/, and npm runs `prebuild` ahead of `build`, so
// the ordering works with no Vite configuration. Running `npm run dev` serves
// the same files, so local testing matches production.
//
// THIS SCRIPT MUST NEVER FAIL THE BUILD. Every path out of it is exit 0: if
// sharp is missing, a source is corrupt, or the disk is full, it writes an
// empty manifest and gives up. An empty manifest makes every runtime lookup
// miss, which makes the app render the plain single-size <img> it renders
// today. Degraded images are a worse page; a failed build is no page.
import { mkdir, readdir, readFile, writeFile, stat, rm, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { availableParallelism } from 'node:os'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PUBLIC = join(ROOT, 'public')
const OUT_DIR = join(PUBLIC, '_img')
const MANIFEST_PATH = join(OUT_DIR, 'manifest.json')
// Deliberately NOT under public/: Vite copies publicDir verbatim into dist, so
// a cache file kept beside the output would be served to browsers. node_modules
// also happens to be what Vercel restores between builds, which is the only way
// this cache can ever help a deploy rather than just local reruns.
const CACHE_DIR = join(ROOT, 'node_modules/.tmp')
const CACHE_PATH = join(CACHE_DIR, 'optimize-images.json')

/** Directories swept wholesale, each with the ladder its contents are sized to. */
const SWEPT = [
  ['hero', 'hero'],
  ['pages', 'pages'],
  ['grants', 'grants'],
]

/** Individually named sources that sit at the public root. */
const STANDALONE = [['ktiphero.webp', 'hero']]

/**
 * Encoder settings. Bumping any value here changes settingsHash() and so
 * invalidates every cached output — that is the intent.
 *
 * The largest width runs AVIF at a higher quality than the rest because it is
 * the candidate a desktop LCP pulls, and because it sits under PageHero's four
 * stacked overlays: blur and gradient washes mask compression artifacts but
 * generate their own banding, and the two compound in the smooth sky and water
 * that dominate this photo set.
 */
const ENCODE = {
  avifTop: { quality: 55, effort: 4 },
  avifRest: { quality: 50, effort: 4 },
  webpRest: { quality: 72, effort: 5 },
}

const SETTINGS_HASH_INPUT = { v: 1, ...ENCODE }

function log(msg) {
  console.log(`[optimize-images] ${msg}`)
}

async function writeEmptyManifest(base) {
  try {
    await mkdir(OUT_DIR, { recursive: true })
    await writeFile(MANIFEST_PATH, JSON.stringify({ v: 1, base, images: {} }))
  } catch {
    // If even this fails the plugin's own missing-file fallback covers it.
  }
}

/** Runs `worker` over `items` with a bounded pool. */
async function pool(items, limit, worker) {
  const queue = [...items.entries()]
  const results = []
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      const [index, item] = next
      results[index] = await worker(item)
    }
  })
  await Promise.all(runners)
  return results
}

async function main() {
  // Dynamic, and inside the try: a failure to resolve sharp or to type-strip
  // the shared module has to degrade, not throw out of the process.
  const sharpModule = await import('sharp')
  const sharp = sharpModule.default ?? sharpModule
  const { LADDERS, IMG_BASE, capLadder, variantPath, srcKeyParts, settingsHash } = await import(
    '../src/lib/image-variants.ts'
  )

  const setHash = settingsHash(SETTINGS_HASH_INPUT)

  // --- discover sources -----------------------------------------------------
  /** @type {{ key: string, file: string, ladder: readonly number[] }[]} */
  const sources = []
  for (const [dir, ladderName] of SWEPT) {
    const abs = join(PUBLIC, dir)
    if (!existsSync(abs)) continue
    for (const file of await readdir(abs)) {
      if (!/\.(webp|png|jpe?g)$/i.test(file)) continue
      sources.push({ key: `/${dir}/${file}`, file: join(abs, file), ladder: LADDERS[ladderName] })
    }
  }
  for (const [file, ladderName] of STANDALONE) {
    const abs = join(PUBLIC, file)
    if (existsSync(abs)) {
      sources.push({ key: `/${file}`, file: abs, ladder: LADDERS[ladderName] })
    }
  }

  if (sources.length === 0) {
    log('no source images found; writing an empty manifest')
    await writeEmptyManifest(IMG_BASE)
    return
  }

  await mkdir(OUT_DIR, { recursive: true })

  /** @type {Record<string, {mtimeMs:number,size:number,contentHash:string,settingsHash:string}>} */
  let cache = {}
  try {
    cache = JSON.parse(await readFile(CACHE_PATH, 'utf8'))
  } catch {
    // First run, or a corrupt cache. Either way: regenerate everything.
  }

  const concurrency = Math.max(1, availableParallelism() - 1)
  let encoded = 0
  let reused = 0
  let inBytes = 0
  let outBytes = 0

  const nextCache = {}
  /** Every file this run considers current — anything else in _img gets pruned. */
  const expected = new Set([relative(OUT_DIR, MANIFEST_PATH)])

  const entries = await pool(sources, concurrency, async ({ key, file, ladder }) => {
    const info = await stat(file)
    const bytes = await readFile(file)
    const contentHash = createHash('sha256').update(bytes).digest('hex').slice(0, 8)

    const meta = await sharp(bytes).metadata()
    if (!meta.width || !meta.height) {
      log(`skipped ${key}: no dimensions`)
      return null
    }

    const widths = capLadder(meta.width, ladder)
    const { dir, name } = srcKeyParts(key)
    const top = widths[widths.length - 1]

    const targets = widths.flatMap((width) => [
      { width, ext: 'avif' },
      { width, ext: 'webp' },
    ])
    for (const { width, ext } of targets) {
      expected.add(relative(OUT_DIR, join(PUBLIC, variantPath(dir, name, width, contentHash, ext))))
    }

    nextCache[key] = { mtimeMs: info.mtimeMs, size: info.size, contentHash, settingsHash: setHash }

    const prev = cache[key]
    const unchanged =
      prev &&
      prev.contentHash === contentHash &&
      prev.settingsHash === setHash &&
      targets.every(({ width, ext }) =>
        existsSync(join(PUBLIC, variantPath(dir, name, width, contentHash, ext)))
      )

    if (unchanged) {
      reused++
    } else {
      await mkdir(join(OUT_DIR, dir), { recursive: true })
      for (const width of widths) {
        const isTop = width === top
        const avifOut = join(PUBLIC, variantPath(dir, name, width, contentHash, 'avif'))
        const webpOut = join(PUBLIC, variantPath(dir, name, width, contentHash, 'webp'))

        await sharp(bytes)
          .resize({ width, withoutEnlargement: true })
          .avif(isTop ? ENCODE.avifTop : ENCODE.avifRest)
          .toFile(avifOut)

        // The top rung is copied rather than re-encoded. The source is already
        // one lossy WebP generation (the original PNG/JPEGs were deleted), so
        // re-encoding it to WebP at its own width buys a second generation of
        // loss for no size win. AVIF is re-encoded at every width because there
        // the format change pays for the generation: 33-40% smaller, measured
        // on these exact files.
        if (isTop && width === meta.width && /\.webp$/i.test(file)) {
          await copyFile(file, webpOut)
        } else {
          await sharp(bytes)
            .resize({ width, withoutEnlargement: true })
            .webp(ENCODE.webpRest)
            .toFile(webpOut)
        }
      }
      encoded++
    }

    inBytes += info.size
    return [key, { w: meta.width, h: meta.height, hash: contentHash, widths }]
  })

  const images = Object.fromEntries(entries.filter(Boolean))

  // --- prune ----------------------------------------------------------------
  // Outputs are content-addressed, so a changed source leaves its old variants
  // behind. Without this, _img grows without bound and ships dead bytes.
  let pruned = 0
  async function sweep(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, item.name)
      if (item.isDirectory()) {
        await sweep(abs)
        continue
      }
      if (!expected.has(relative(OUT_DIR, abs))) {
        await rm(abs, { force: true })
        pruned++
      }
    }
  }
  await sweep(OUT_DIR)

  await writeFile(MANIFEST_PATH, JSON.stringify({ v: 1, base: IMG_BASE, images }))
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(CACHE_PATH, JSON.stringify(nextCache))

  // Totalled here, in one deterministic pass over the finished manifest, rather
  // than accumulated inside the concurrent workers.
  let files = 0
  for (const [key, entry] of Object.entries(images)) {
    const { dir, name } = srcKeyParts(key)
    for (const width of entry.widths) {
      for (const ext of ['avif', 'webp']) {
        try {
          outBytes += (await stat(join(PUBLIC, variantPath(dir, name, width, entry.hash, ext)))).size
          files++
        } catch {
          log(`warning: expected variant missing for ${key} @${width}.${ext}`)
        }
      }
    }
  }

  const mb = (n) => (n / 1048576).toFixed(1)
  const kb = (n) => (n / 1024).toFixed(0)
  log(
    `${Object.keys(images).length} sources, ${encoded} encoded, ${reused} reused` +
      (pruned ? `, ${pruned} pruned` : '')
  )
  log(`${mb(inBytes)} MB of sources -> ${files} variants, ${mb(outBytes)} MB on disk`)

  // The number that actually matters. Disk total goes UP (that is the point of
  // a ladder); what falls is what any one visitor downloads.
  const sample = images['/hero/hero-1.webp']
  if (sample) {
    const { dir, name } = srcKeyParts('/hero/hero-1.webp')
    const pick = async (width, ext) => {
      try {
        return (await stat(join(PUBLIC, variantPath(dir, name, width, sample.hash, ext)))).size
      } catch {
        return 0
      }
    }
    const before = inBytes / Object.keys(images).length
    log(
      `a 390px phone at DPR3 now pulls ${kb(await pick(1280, 'avif'))} KB for a hero ` +
        `(was ${kb(await pick(sample.widths[sample.widths.length - 1], 'webp'))} KB); ` +
        `average source was ${kb(before)} KB`
    )
  }
}

try {
  await main()
} catch (err) {
  log(`skipped: ${err?.message ?? err}`)
  log('the app will fall back to the original single-size images')
  await writeEmptyManifest('/_img')
}
