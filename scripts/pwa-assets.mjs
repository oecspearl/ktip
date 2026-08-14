// Re-generates the installable-app icon set from the existing PWA master.
// Usage: node scripts/pwa-assets.mjs
//
// Separate from optimize-brand-assets.mjs because these are not brand marks
// rendered in a box — they are OS surfaces. A launcher icon is cropped by the
// platform, not by CSS, and getting that wrong is what makes an installed app
// look broken next to real ones.
//
// WHAT WAS WRONG
// --------------
// public/manifest.json declared the SAME file for `purpose: "any"` and
// `purpose: "maskable"`. Those are opposite requirements:
//
//   any       — drawn as-is. Wants the mark filling the tile.
//   maskable  — the platform crops it to its own shape (circle on most
//               Android launchers, squircle on others) and may zoom to 120%.
//               Everything outside the middle 80% — the "safe zone" — can be
//               cut off.
//
// One file cannot satisfy both: sized for `any` it loses its edges under the
// mask; sized for `maskable` it floats small and padded everywhere else. So
// this emits two, and the manifest points each purpose at the right one.
//
// The 512 master is also a 179 kB PNG, which is precached by the service
// worker on first visit. Re-encoded here at the same dimensions for a fraction
// of the bytes.
import sharp from 'sharp'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stat } from 'node:fs/promises'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PUBLIC = join(ROOT, 'public')

const MASTER = join(PUBLIC, 'pwa-512x512.png')

/** Brand navy — the manifest background_color, so the padding is invisible. */
const NAVY = { r: 4, g: 30, b: 66, alpha: 1 }

const kb = (n) => `${(n / 1024).toFixed(1)} kB`

async function report(label, file) {
  const { size } = await stat(file)
  console.log(`  ${label.padEnd(34)} ${kb(size).padStart(10)}`)
}

console.log('PWA icons\n')

// `any` — the mark at full bleed, re-encoded. palette:true is safe here: the
// mark is flat brand colour on a flat ground, so an indexed PNG is lossless in
// practice and a fraction of the truecolor size.
for (const size of [192, 512]) {
  const out = join(PUBLIC, `pwa-${size}x${size}.png`)
  await sharp(MASTER)
    .resize(size, size, { fit: 'contain', background: NAVY })
    .png({ compressionLevel: 9, palette: true })
    .toFile(`${out}.tmp`)
  const { rename } = await import('node:fs/promises')
  await rename(`${out}.tmp`, out)
  await report(`pwa-${size}x${size}.png (any)`, out)
}

// `maskable` — the same mark inset to the middle 80%, on an opaque navy field.
// The inset is what survives a circular crop; the opaque ground is required,
// because a transparent maskable icon renders as a black blob on several
// Android launchers.
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.8)
  const pad = Math.round((size - inner) / 2)
  const out = join(PUBLIC, `pwa-maskable-${size}x${size}.png`)
  const markBuffer = await sharp(MASTER)
    .resize(inner, inner, { fit: 'contain', background: { ...NAVY, alpha: 0 } })
    .toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY },
  })
    .composite([{ input: markBuffer, top: pad, left: pad }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(out)
  await report(`pwa-maskable-${size}x${size}.png`, out)
}

// Apple touch icon. iOS applies its own rounded-rect mask and does NOT respect
// transparency — an alpha channel there composites against black. Flattened
// onto navy so the corners match the rest of the mark.
{
  const out = join(PUBLIC, 'apple-touch-icon.png')
  await sharp(MASTER)
    .resize(180, 180, { fit: 'contain', background: NAVY })
    .flatten({ background: NAVY })
    .png({ compressionLevel: 9, palette: true })
    .toFile(out)
  await report('apple-touch-icon.png (180)', out)
}

console.log('\nDone. manifest.json and index.html reference these by name.')
