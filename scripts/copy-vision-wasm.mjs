// Copies the MediaPipe tasks-vision WASM runtime into public/vision/wasm/ so
// the portrait cutout (src/lib/portrait-cutout.ts) can self-host it under the
// app's own origin — `default-src 'self'` in vercel.json is the point, no CDN.
//
// Output is gitignored; this script is the source of truth. It runs from both
// `prebuild` and `dev` because dev does not run prebuild, and a missing wasm in
// dev looks exactly like a model bug.
//
// Only the SIMD pair is what modern browsers fetch (~12 MB, measured — not the
// 3 MB an early estimate assumed). The nosimd pair is copied too so an old
// Android WebView degrades instead of failing; the _module_ pair is skipped
// because nothing here asks for it. Nothing precaches any of it
// (vite.config.ts globPatterns is an allowlist and does not name public/vision).
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const OUT = join(ROOT, 'public', 'vision', 'wasm')

if (!existsSync(SRC)) {
  console.error('[vision] @mediapipe/tasks-vision is not installed; run npm install')
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })

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
console.log(`[vision] wasm runtime ${copied ? `copied (${copied} files)` : 'up to date'} → public/vision/wasm`)
