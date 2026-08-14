/**
 * Bundle + precache report.
 *
 * Answers the two questions a Lighthouse score cannot: what is actually in the
 * critical path, and how much does the service worker download behind it.
 *
 * Deliberately zero-dependency. `rollup-plugin-visualizer` is already wired
 * behind ANALYZE=1 (vite.config.ts) and produces a treemap, which is the right
 * tool for "why is this chunk big". This is the other half — a number you can
 * put in a table and diff across commits, including the precache total, which
 * the visualizer knows nothing about because it is a VitePWA concern.
 *
 *   node scripts/perf/bundle-report.mjs            # report on existing dist/
 *   node scripts/perf/bundle-report.mjs --build    # build first
 *   node scripts/perf/bundle-report.mjs --json     # machine-readable only
 *
 * Writes docs/perf/bundle-<iso>.json and, when a previous report exists,
 * prints the delta. docs/ is gitignored, so these accumulate locally and never
 * reach the repo — and unlike dist/, they survive a rebuild.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname, basename } from 'node:path'
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const DIST = join(ROOT, 'dist')
const OUT_DIR = join(ROOT, 'docs', 'perf')

const args = new Set(process.argv.slice(2))
const JSON_ONLY = args.has('--json')

/**
 * The precache set, read out of the generated sw.js.
 *
 * Workbox replaces `self.__WB_MANIFEST` with the real array of
 * `{url, revision}` at build time, so this is what the browser will actually
 * fetch — not a mirror of `globPatterns` that silently drifts the moment
 * someone edits vite.config.ts.
 *
 * Returns null when sw.js is absent, which is itself worth reporting: an
 * ANALYZE build used to fail after writing the chunks but before generating
 * the worker, leaving a dist whose registerSW.js pointed at a 404.
 */
function readPrecacheUrls() {
  const sw = join(DIST, 'sw.js')
  if (!existsSync(sw)) return null
  const text = readFileSync(sw, 'utf8')
  // Keys are unquoted — the worker is minified: {url:"assets/entry-x.js",revision:null}
  const urls = new Set()
  for (const m of text.matchAll(/\burl:"([^"]+)"/g)) urls.add(m[1])
  return urls
}

const BR_TEXT = { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

function sizes(file) {
  const buf = readFileSync(file)
  return {
    raw: buf.length,
    gzip: gzipSync(buf).length,
    brotli: brotliCompressSync(buf, BR_TEXT).length,
  }
}

function kb(n) {
  return `${(n / 1024).toFixed(1)} kB`
}

function pad(s, n) {
  return String(s).padEnd(n)
}

function padStart(s, n) {
  return String(s).padStart(n)
}

if (args.has('--build')) {
  if (!JSON_ONLY) console.log('Building (ANALYZE=1)…\n')
  execFileSync('npm', ['run', 'build'], {
    stdio: JSON_ONLY ? 'ignore' : 'inherit',
    env: { ...process.env, ANALYZE: '1' },
    shell: process.platform === 'win32',
  })
}

if (!existsSync(DIST)) {
  console.error('No dist/. Run `npm run build` first, or pass --build.')
  process.exit(1)
}

const files = walk(DIST)

/**
 * The critical path is whatever index.html makes the browser fetch before it
 * can paint: the entry module, the stylesheet, and — once the modulepreload
 * for the locale catalog lands — that catalog too. Parsed out of the emitted
 * HTML rather than guessed from filenames, because the hashes change every
 * build and a stale guess would silently report the wrong chunk.
 */
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const criticalRefs = new Set()
for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) criticalRefs.add(m[1])
for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) criticalRefs.add(m[1])
for (const m of html.matchAll(/<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"/g)) criticalRefs.add(m[1])
for (const m of html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)) criticalRefs.add(m[1])
// The route-chunk preload is emitted as an inline script holding a JSON map of
// pathname -> chunk (vite.config.ts routeChunkPreloadPlugin), so the hrefs are
// not in any tag attribute.
for (const m of html.matchAll(/l\.href="([^"]+)"/g)) criticalRefs.add(m[1])
for (const m of html.matchAll(/"(\/assets\/[^"]+\.js)"/g)) criticalRefs.add(m[1])

const precacheUrls = readPrecacheUrls()

const rows = files.map((file) => {
  const rel = relative(DIST, file).replace(/\\/g, '/')
  const url = `/${rel}`
  const ext = extname(file)
  const s = sizes(file)
  const precached = precacheUrls ? precacheUrls.has(rel) || precacheUrls.has(url) : false
  return { rel, url, ext, ...s, precached, critical: criticalRefs.has(url) }
})

const sum = (list, key) => list.reduce((n, r) => n + r[key], 0)

/**
 * The locale catalog has to be counted even though index.html does not
 * reference it.
 *
 * Lingui compiles to hash message ids and the Babel macro strips the English
 * default out of the production bundle, so until the catalog resolves every
 * label on screen is a string like "-0B-ue". It is therefore part of first
 * paint in every sense that matters, but it is currently discovered from a
 * useEffect two hops in — so a naive "what does the HTML reference" scan misses
 * it entirely, and preloading it later would read as a +165 kB regression when
 * it is the opposite. Counted separately and always.
 */
const isCatalog = (rel) => /assets\/(?:locale-[a-z]+|messages)-[^/]+\.js$/.test(rel)
// The DEFAULT locale's catalog specifically, and null when there is none.
// English ships no catalog since the macro keeps its inline `message`
// defaults, so a "largest catalog" fallback here would silently start
// charging English first paint for the French one.
const catalog = rows.find((r) => /assets\/locale-en-[^/]+\.js$/.test(r.rel)) ?? null

const js = rows.filter((r) => r.ext === '.js' || r.ext === '.mjs')
const css = rows.filter((r) => r.ext === '.css')
const images = rows.filter((r) => ['.webp', '.avif', '.png', '.jpg', '.jpeg', '.svg'].includes(r.ext))
const precached = rows.filter((r) => r.precached)
const critical = rows.filter((r) => r.critical)

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    files: rows.length,
    dist: { raw: sum(rows, 'raw') },
    js: { count: js.length, raw: sum(js, 'raw'), gzip: sum(js, 'gzip'), brotli: sum(js, 'brotli') },
    css: { count: css.length, raw: sum(css, 'raw'), gzip: sum(css, 'gzip'), brotli: sum(css, 'brotli') },
    images: { count: images.length, raw: sum(images, 'raw') },
  },
  criticalPath: {
    count: critical.length,
    raw: sum(critical, 'raw'),
    gzip: sum(critical, 'gzip'),
    brotli: sum(critical, 'brotli'),
    files: critical
      .sort((a, b) => b.raw - a.raw)
      .map((r) => ({ file: r.rel, raw: r.raw, gzip: r.gzip, brotli: r.brotli })),
  },
  /**
   * What a first-time visitor to `/` must have before the page reads as the
   * app: the shell (entry + stylesheet), the landing route's own chunk, and
   * the locale catalog. `/login`'s preloaded chunk is excluded — only one of
   * the two route preloads ever fires, and counting both overstates every run.
   */
  firstPaint: (() => {
    // Excluded: /login's preloaded chunk (only one of the two route preloads
    // ever fires) and the non-default locale catalogs (the preload script
    // carries a map of all three and picks one at runtime, so all three appear
    // as "referenced" — counting them would treble the figure).
    const parts = critical.filter(
      (r) => !/LoginPage/.test(r.rel) && (!isCatalog(r.rel) || r.rel === catalog?.rel)
    )
    if (catalog && !parts.some((r) => r.rel === catalog.rel)) parts.push(catalog)
    return {
      raw: sum(parts, 'raw'),
      gzip: sum(parts, 'gzip'),
      brotli: sum(parts, 'brotli'),
      catalogIsPreloaded: catalog ? critical.some((r) => r.rel === catalog.rel) : false,
      files: parts
        .sort((a, b) => b.raw - a.raw)
        .map((r) => ({ file: r.rel, raw: r.raw, gzip: r.gzip, brotli: r.brotli })),
    }
  })(),
  precache: {
    count: precached.length,
    raw: sum(precached, 'raw'),
    gzip: sum(precached, 'gzip'),
  },
  largest: rows
    .sort((a, b) => b.raw - a.raw)
    .slice(0, 20)
    .map((r) => ({ file: r.rel, raw: r.raw, gzip: r.gzip, brotli: r.brotli })),
}

mkdirSync(OUT_DIR, { recursive: true })
const stamp = report.generatedAt.replace(/[:.]/g, '-')
const outFile = join(OUT_DIR, `bundle-${stamp}.json`)
writeFileSync(outFile, JSON.stringify(report, null, 2))

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

// Compare against the most recent earlier report so a regression is visible
// without opening two files.
const previous = readdirSync(OUT_DIR)
  .filter((f) => f.startsWith('bundle-') && f.endsWith('.json') && !outFile.endsWith(f))
  .sort()
  .pop()
const prev = previous ? JSON.parse(readFileSync(join(OUT_DIR, previous), 'utf8')) : null

const delta = (now, before) => {
  if (!before) return ''
  const d = now - before
  if (d === 0) return '  (unchanged)'
  return `  (${d > 0 ? '+' : ''}${kb(d)})`
}

console.log('\n  FIRST PAINT OF `/` — everything needed before the page reads as the app')
console.log('  ' + '─'.repeat(74))
for (const f of report.firstPaint.files) {
  console.log(`  ${pad(f.file, 46)} ${padStart(kb(f.raw), 11)} ${padStart(kb(f.gzip), 11)} gz`)
}
console.log('  ' + '─'.repeat(74))
console.log(
  `  ${pad('TOTAL', 46)} ${padStart(kb(report.firstPaint.raw), 11)} ${padStart(kb(report.firstPaint.gzip), 11)} gz` +
    delta(report.firstPaint.gzip, prev?.firstPaint?.gzip)
)
console.log(
  !catalog
    ? '  Default locale ships no catalog — English strings are inline in each chunk.'
    : report.firstPaint.catalogIsPreloaded
      ? '  Locale catalog is preloaded — downloads alongside the entry.'
      : '  Locale catalog is NOT preloaded — it is a serial hop AFTER the entry parses.'
)

console.log('\n  SERVICE WORKER PRECACHE — downloaded in the background on first visit')
console.log(
  `  ${report.precache.count} files, ${kb(report.precache.raw)} raw / ${kb(report.precache.gzip)} gz` +
    delta(report.precache.raw, prev?.precache?.raw)
)

console.log('\n  TOTALS')
console.log(
  `  JS   ${report.totals.js.count} files  ${kb(report.totals.js.raw)} raw / ${kb(report.totals.js.gzip)} gz` +
    delta(report.totals.js.gzip, prev?.totals?.js?.gzip)
)
console.log(
  `  CSS  ${report.totals.css.count} files  ${kb(report.totals.css.raw)} raw / ${kb(report.totals.css.gzip)} gz` +
    delta(report.totals.css.gzip, prev?.totals?.css?.gzip)
)
console.log(`  IMG  ${report.totals.images.count} files  ${kb(report.totals.images.raw)} raw`)
console.log(`  dist ${report.totals.files} files  ${kb(report.totals.dist.raw)}`)

console.log('\n  LARGEST 20')
console.log('  ' + '─'.repeat(74))
for (const f of report.largest) {
  console.log(`  ${pad(f.file, 46)} ${padStart(kb(f.raw), 11)} ${padStart(kb(f.gzip), 11)} gz`)
}

console.log(`\n  Written to ${relative(ROOT, outFile).replace(/\\/g, '/')}`)
if (prev) console.log(`  Compared against ${previous}`)
if (existsSync(join(DIST, 'stats.html'))) console.log('  Treemap: dist/stats.html\n')
else console.log('  Treemap: re-run with --build for dist/stats.html\n')
