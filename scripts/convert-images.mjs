// One-time (re-runnable) conversion of public/ images to WebP.
// Usage: node scripts/convert-images.mjs
// Writes .webp siblings; originals are removed separately once code refs are updated.
import sharp from 'sharp'
import { readdir, stat } from 'node:fs/promises'
import { join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUB = fileURLToPath(new URL('../public', import.meta.url))

// [srcRelative, outRelative, maxWidth, quality]
const jobs = [
  ['KTIP LOGO.png', 'ktip-logo.webp', 512, 82],
  ['ktip logo no bg.png', 'ktip-logo-nobg.webp', 256, 82],
  ['ktiphero.png', 'ktiphero.webp', 1920, 72],
  ['oecs.png', 'oecs.webp', 400, 82],
  ['worldbank.jpeg', 'worldbank.webp', 400, 82],
]

for (const [dir, maxW] of [['hero', 1920], ['pages', 1600], ['grants', 1600]]) {
  for (const f of await readdir(join(PUB, dir))) {
    if (!/\.(jpe?g|png)$/i.test(f)) continue
    jobs.push([join(dir, f), join(dir, parse(f).name + '.webp'), maxW, 72])
  }
}

let inTotal = 0
let outTotal = 0
for (const [src, out, width, quality] of jobs) {
  const srcPath = join(PUB, src)
  const outPath = join(PUB, out)
  await sharp(srcPath)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toFile(outPath)
  const [a, b] = await Promise.all([stat(srcPath), stat(outPath)])
  inTotal += a.size
  outTotal += b.size
  console.log(`${src} ${(a.size / 1024).toFixed(0)} KB -> ${out} ${(b.size / 1024).toFixed(0)} KB`)
}
console.log(`TOTAL ${(inTotal / 1048576).toFixed(1)} MB -> ${(outTotal / 1048576).toFixed(1)} MB`)
