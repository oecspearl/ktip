// Re-generates the small brand assets from their masters.
// Usage: node scripts/optimize-brand-assets.mjs
//
// These are the fixed-size marks — the logo and the reaction emoji — as opposed
// to the hero photography, which is responsive and belongs to the build-time
// pipeline. They get one right-sized file each rather than a width ladder,
// because every one of their call sites renders them inside a narrow, known
// box (the logo 28-56 CSS px, the emoji 24-26), so a single asset at 192 / 96
// already covers DPR 3+ with room to spare. A srcset would save a few more
// kilobytes on low-DPR phones at the cost of <picture> markup in a dozen
// places.
//
// The masters stay in the repo and are never overwritten: they are the only
// high-resolution copies left after the original PNG/JPEG sources were removed,
// so anything needing a larger mark later (og:image, print, a bigger splash)
// still has one to work from.
import sharp from 'sharp'
import { readdir, stat } from 'node:fs/promises'
import { join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PUBLIC = join(ROOT, 'public')
const EMOJI = join(ROOT, 'src/assets/emoji')

// [master, output, width, encoder]
const jobs = [
  // 512x512 with alpha. 128 is sized to the two cases that actually matter:
  // the navbar at 40 CSS px on a DPR-3 phone (120), and the navbar at its lg
  // step of 56 px on a DPR-2 desktop (112). The only site that wants more is
  // the 64 px UAT icon on a DPR-3 screen, which is decorative and lazy-loaded.
  // 4:4:4 chroma: the mark has hard colour edges, and subsampling smears them
  // at this size in a way that is visible against the navbar's flat ground.
  [join(PUBLIC, 'ktip-logo.webp'), join(PUBLIC, 'ktip-logo-128.webp'), 128, { quality: 88, effort: 6, chromaSubsampling: '4:4:4' }],
]

for (const file of await readdir(EMOJI)) {
  if (!/\.png$/i.test(file)) continue
  jobs.push([
    join(EMOJI, file),
    join(EMOJI, `${parse(file).name}.webp`),
    96,
    { quality: 82, effort: 6 },
  ])
}

// Favicons are the same mark again, but they get their own pass because the
// browser tab is the one place the logo is rendered smaller than its own
// padding. The master is 512x512 with the mark occupying 413x377 of it, so a
// browser downscaling the 192 PWA icon to a 16 px tab spends three of those
// pixels on empty margin and draws the gear at ~12. Trimming the alpha box
// first and resizing to fill the tile buys back ~25% of linear size, which at
// this scale is the difference between a readable mark and a smudge. Sharpened
// after the downscale: lanczos leaves the circuit traces soft at 16, and PNG
// (not WebP) because Safari and Windows shortcut tiles still want it.
const FAVICON_MASTER = join(PUBLIC, 'ktip-logo.webp')
const faviconTrim = await sharp(FAVICON_MASTER).trim({ threshold: 10 }).png().toBuffer()
for (const size of [16, 32, 48]) {
  const out = join(PUBLIC, `favicon-${size}.png`)
  await sharp(faviconTrim)
    .resize({ width: size, height: size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .sharpen({ sigma: 0.6 })
    .png({ compressionLevel: 9, palette: true })
    .toFile(out)
  const { size: bytes } = await stat(out)
  console.log(`${FAVICON_MASTER.slice(ROOT.length).replace(/\\/g, '/')} -> public/favicon-${size}.png ${(bytes / 1024).toFixed(1)} KB`)
}

let inTotal = 0
let outTotal = 0
for (const [src, out, width, encoder] of jobs) {
  await sharp(src)
    .resize({ width, withoutEnlargement: true })
    .webp(encoder)
    .toFile(out)
  const [a, b] = await Promise.all([stat(src), stat(out)])
  inTotal += a.size
  outTotal += b.size
  const rel = (p) => p.slice(ROOT.length).replace(/\\/g, '/')
  console.log(
    `${rel(src)} ${(a.size / 1024).toFixed(1)} KB -> ${rel(out)} ${(b.size / 1024).toFixed(1)} KB`
  )
}
console.log(`TOTAL ${(inTotal / 1024).toFixed(0)} KB -> ${(outTotal / 1024).toFixed(0)} KB`)
