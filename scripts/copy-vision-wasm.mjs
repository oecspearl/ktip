// Copies the MediaPipe tasks-vision WASM runtime into public/vision/wasm/<version>/
// so the portrait cutout (src/lib/portrait-cutout.ts) can self-host it under the
// app's own origin — `default-src 'self'` in vercel.json is the point, no CDN.
//
// Output is gitignored; this script is the source of truth. It runs from both
// `prebuild` and `dev` because dev does not run prebuild, and a missing wasm in
// dev looks exactly like a model bug.
//
// The folder is named for the installed package version so vercel.json can serve
// it immutable for a year. That only stays correct if the loader path changes
// with every upgrade, so the version is also written into portrait-cutout.ts
// (VISION_WASM_BASE) and this script refuses to run when the two disagree. A
// stale path would pair new JS with a year-cached old runtime on every
// returning browser; failing the build is the cheaper outcome.
//
// Only the SIMD pair is what modern browsers fetch (~12 MB, measured — not the
// 3 MB an early estimate assumed). The nosimd pair is copied too so an old
// Android WebView degrades instead of failing; the _module_ pair is skipped
// because nothing here asks for it. Nothing precaches any of it
// (vite.config.ts globPatterns is an allowlist and does not name public/vision).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision')
const SRC = join(PKG, 'wasm')
const OUT_ROOT = join(ROOT, 'public', 'vision', 'wasm')
const LOADER = join(ROOT, 'src', 'lib', 'portrait-cutout.ts')

if (!existsSync(SRC)) {
  console.error('[vision] @mediapipe/tasks-vision is not installed; run npm install')
  process.exit(1)
}

const version = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version
const wanted = readFileSync(LOADER, 'utf8').match(/VISION_WASM_BASE\s*=\s*['"]\/vision\/wasm\/([^'"/]+)['"]/)?.[1]
if (wanted !== version) {
  console.error(
    `[vision] src/lib/portrait-cutout.ts loads the runtime from /vision/wasm/${wanted ?? '(not found)'}, ` +
      `but @mediapipe/tasks-vision ${version} is installed. Set VISION_WASM_BASE to '/vision/wasm/${version}'.`
  )
  process.exit(1)
}

const OUT = join(OUT_ROOT, version)
mkdirSync(OUT, { recursive: true })

// Anything else under public/vision/wasm/ is an earlier layout (the files used
// to sit loose at the top) or an earlier version. public/ is copied into dist
// whole, so leaving them would ship another 22 MB nothing loads.
for (const name of readdirSync(OUT_ROOT)) {
  if (name !== version) rmSync(join(OUT_ROOT, name), { recursive: true, force: true })
}

let copied = 0
for (const name of readdirSync(SRC)) {
  if (!/\.(wasm|js)$/.test(name)) continue
  // FilesetResolver.forVisionTasks(path, useModule = false) — the app never
  // asks for the `_module_` variant, so 12 MB of it would have no reader.
  if (name.includes('_module_')) continue
  const from = join(SRC, name)
  const to = join(OUT, name)
  const fresh = existsSync(to) && statSync(to).size === statSync(from).size && statSync(to).mtimeMs >= statSync(from).mtimeMs
  if (fresh) continue
  copyFileSync(from, to)
  copied++
}
console.log(`[vision] wasm runtime ${copied ? `copied (${copied} files)` : 'up to date'} → public/vision/wasm/${version}`)
