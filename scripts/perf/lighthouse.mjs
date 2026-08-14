/**
 * Lighthouse mobile runs, scored against the gates this work is aiming at.
 *
 * Shells out to `npx lighthouse` rather than adding it to devDependencies:
 * it pulls Puppeteer and a browser download into every `npm ci`, including
 * Vercel's, to serve a script nobody runs during a deploy. npx keeps it a
 * developer tool.
 *
 *   node scripts/perf/lighthouse.mjs                      # boots vite preview
 *   node scripts/perf/lighthouse.mjs --url https://…      # deployed build
 *   node scripts/perf/lighthouse.mjs --route /dashboard   # non-root route
 *   node scripts/perf/lighthouse.mjs --desktop            # desktop preset
 *   node scripts/perf/lighthouse.mjs --runs 3             # median of N
 *
 * Writes docs/perf/lighthouse-<iso>.json. docs/ is gitignored.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawn, execSync, execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const DIST = join(ROOT, 'dist')
// docs/ rather than dist/: `vite build` empties its outDir, which deleted the
// whole measurement history on every rebuild — exactly the runs a baseline
// comparison needs. docs/ is gitignored, so these still stay local.
const OUT_DIR = join(ROOT, 'docs', 'perf')
const TMP = join(OUT_DIR, '.lh-run.json')
// Created before the first run, not after: lighthouse writes its report here
// itself and fails outright if the directory is missing.
mkdirSync(OUT_DIR, { recursive: true })

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const has = (name) => argv.includes(`--${name}`)

const route = flag('route', '/')
const runs = Number(flag('runs', '1'))
const desktop = has('desktop')
let url = flag('url', null)

/**
 * The gates from the mobile performance plan. Lighthouse's own scoring curve
 * is a 0-100 blend; these are the raw numbers the work is actually judged on,
 * so they are asserted separately and drive the exit code.
 */
const GATES = desktop
  ? { lcp: 1500, tbt: 100, cls: 0.1, si: 2000 }
  : { lcp: 2500, tbt: 200, cls: 0.1, si: 3400 }

/**
 * chrome-launcher only probes for Chrome, and this machine class often has
 * only Edge. Both are Chromium and Lighthouse drives either over CDP, so point
 * CHROME_PATH at whichever exists rather than making a browser install a
 * prerequisite for measuring anything. An explicit CHROME_PATH always wins.
 */
function resolveBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const local = process.env.LOCALAPPDATA ?? ''
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          join(local, 'Google\\Chrome\\Application\\chrome.exe'),
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge']
  return candidates.find((p) => existsSync(p)) ?? null
}

const browser = resolveBrowser()
if (!browser) {
  console.error('No Chrome or Edge found. Install one, or set CHROME_PATH.')
  process.exit(1)
}
process.env.CHROME_PATH = browser

let preview = null

/**
 * Without --url, serve the local build. `vite preview` is used rather than a
 * static server because it applies the same SPA fallback vercel.json does —
 * measuring /dashboard against a server that 404s it would score a blank page.
 */
async function startPreview() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('No dist/index.html. Run `npm run build` first, or pass --url.')
    process.exit(1)
  }
  console.log('Starting vite preview…')
  // vite's bin is invoked through node directly rather than `npm run preview`:
  // npm adds a wrapper process that has to be killed as a tree on Windows, and
  // `shell: true` with an args array is both a deprecation warning and a
  // quoting hazard under a path containing a space ("OECS KTIP").
  preview = spawn(
    process.execPath,
    [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', '4173', '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  let exited = null
  preview.on('exit', (code) => {
    exited = code
  })

  // Polled rather than parsed out of stdout. The banner's wording and colour
  // codes are vite's to change, and a missed match costs a 30s hang for a
  // server that is in fact up.
  const base = 'http://localhost:4173'
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`vite preview exited with ${exited}`)
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(1000) })
      if (res.ok) return base
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('vite preview did not start within 30s')
}

function stopPreview() {
  if (!preview) return
  // The npm wrapper spawns vite as a child; killing the wrapper alone on
  // Windows leaves the port held and the next run fails --strictPort.
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' })
    else preview.kill('SIGTERM')
  } catch {
    // Already gone. Nothing to clean up.
  }
}

/**
 * CLS the way Chrome counts it, recomputed from the trace.
 *
 * Lighthouse sums every `LayoutShift` event's `weighted_score_delta`. Chrome
 * does not: a shift flagged `had_recent_input` — one that happened within
 * 500ms of a discrete input — is excluded from the Cumulative Layout Shift a
 * real user is measured on, and the trace carries Chrome's own running total
 * in `cumulative_score` to prove it.
 *
 * The difference is not academic. This page reported CLS 0.360 from a single
 * event whose `cumulative_score` was 0 — an element being REMOVED shortly
 * after first paint (`new_rect [0,0,0,0]`, `frame_max_distance` 734), flagged
 * as input-triggered. Chasing that number cost an afternoon of bisecting a
 * shift no user ever sees.
 *
 * Returns null when the trace is unavailable, in which case the caller keeps
 * Lighthouse's figure rather than inventing one.
 */
function clsFromTrace() {
  const trace = TMP.replace(/\.json$/, '-0.trace.json')
  if (!existsSync(trace)) return null
  try {
    const events = JSON.parse(readFileSync(trace, 'utf8')).traceEvents ?? []
    let counted = 0
    let excluded = 0
    for (const event of events) {
      if (event.name !== 'LayoutShift') continue
      const data = event.args?.data
      const delta = data?.weighted_score_delta ?? data?.score ?? 0
      if (data?.had_recent_input) excluded += delta
      else counted += delta
    }
    return { counted, excluded }
  } catch {
    return null
  }
}

function runLighthouse(target) {
  // Run through a shell, as one quoted string.
  //
  // npx is npx.cmd on Windows, and since Node 20 spawning a .cmd without a
  // shell throws EINVAL outright. Every argument is JSON.stringify'd because
  // cmd.exe is the shell here and --chrome-flags carries spaces; the repo path
  // ("OECS KTIP") does too.
  const q = (s) => JSON.stringify(String(s))
  const parts = [
    'npx --yes lighthouse@12',
    q(target),
    '--quiet',
    '--output=json',
    `--output-path=${q(TMP)}`,
    '--only-categories=performance',
    // Keeps the raw trace so CLS can be recomputed Chrome's way — see
    // clsFromTrace below.
    '--save-assets',
    q('--chrome-flags=--headless=new --no-sandbox --disable-gpu'),
  ]
  if (desktop) parts.push('--preset=desktop')
  try {
    execSync(parts.join(' '), { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT })
  } catch (error) {
    // chrome-launcher deletes its temp profile directory after the run, and on
    // Windows that rmSync throws EPERM while the browser still holds a handle.
    // It happens AFTER the report is written, so a failed exit code with the
    // output file present is a successful run with a messy shutdown. Anything
    // else is a real failure.
    if (!existsSync(TMP)) throw error
    console.log('  (ignored: chrome-launcher temp cleanup failed after the run)')
  }
  const raw = JSON.parse(readFileSync(TMP, 'utf8'))
  const trace = clsFromTrace()
  rmSync(TMP, { force: true })
  rmSync(TMP.replace(/\.json$/, '-0.trace.json'), { force: true })
  rmSync(TMP.replace(/\.json$/, '-0.devtoolslog.json'), { force: true })
  const a = raw.audits
  const reportedCls = a['cumulative-layout-shift'].numericValue
  return {
    score: Math.round((raw.categories.performance.score ?? 0) * 100),
    lcp: a['largest-contentful-paint'].numericValue,
    fcp: a['first-contentful-paint'].numericValue,
    tbt: a['total-blocking-time'].numericValue,
    // Chrome's figure when the trace is readable, Lighthouse's otherwise.
    cls: trace ? trace.counted : reportedCls,
    clsReported: reportedCls,
    clsExcluded: trace ? trace.excluded : null,
    si: a['speed-index'].numericValue,
    tti: a['interactive']?.numericValue ?? null,
    transferBytes: a['total-byte-weight']?.numericValue ?? null,
    mainThreadMs: a['mainthread-work-breakdown']?.numericValue ?? null,
    unusedJsBytes: a['unused-javascript']?.details?.overallSavingsBytes ?? null,
    unusedCssBytes: a['unused-css-rules']?.details?.overallSavingsBytes ?? null,
    imageSavingsBytes: a['uses-responsive-images']?.details?.overallSavingsBytes ?? null,
  }
}

const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const ms = (n) => (n == null ? '—' : `${Math.round(n)} ms`)
const kb = (n) => (n == null ? '—' : `${(n / 1024).toFixed(0)} kB`)

try {
  if (!url) url = await startPreview()
  const target = new URL(route, url).href
  console.log(`\nProfiling ${target} — ${desktop ? 'desktop' : 'mobile'} preset, ${runs} run(s)\n`)

  const results = []
  for (let i = 0; i < runs; i++) {
    if (runs > 1) console.log(`  run ${i + 1}/${runs}…`)
    results.push(runLighthouse(target))
  }

  const pick = (key) => median(results.map((r) => r[key]).filter((v) => v != null))
  const summary = {
    generatedAt: new Date().toISOString(),
    url: target,
    preset: desktop ? 'desktop' : 'mobile',
    runs,
    score: pick('score'),
    metrics: {
      lcp: pick('lcp'),
      fcp: pick('fcp'),
      tbt: pick('tbt'),
      cls: pick('cls'),
      clsReported: pick('clsReported'),
      clsExcluded: pick('clsExcluded'),
      si: pick('si'),
      tti: pick('tti'),
    },
    diagnostics: {
      transferBytes: pick('transferBytes'),
      mainThreadMs: pick('mainThreadMs'),
      unusedJsBytes: pick('unusedJsBytes'),
      unusedCssBytes: pick('unusedCssBytes'),
      imageSavingsBytes: pick('imageSavingsBytes'),
    },
    gates: GATES,
    raw: results,
  }

  const checks = [
    ['LCP', summary.metrics.lcp, GATES.lcp, ms],
    ['TBT', summary.metrics.tbt, GATES.tbt, ms],
    ['CLS', summary.metrics.cls, GATES.cls, (n) => n.toFixed(3)],
    ['Speed Index', summary.metrics.si, GATES.si, ms],
  ]
  let failed = 0

  console.log(`  Performance score  ${summary.score}/100\n`)
  for (const [label, value, gate, fmt] of checks) {
    const ok = value <= gate
    if (!ok) failed++
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(13)} ${fmt(value).padStart(10)}   gate ${fmt(gate)}`)
  }
  if (summary.metrics.clsExcluded > 0) {
    console.log(
      `\n  note: CLS counts only shifts Chrome attributes to the page.` +
        ` ${summary.metrics.clsExcluded.toFixed(3)} more was recorded but flagged` +
        ` had_recent_input, which Chrome excludes and Lighthouse does not` +
        ` (it reports ${summary.metrics.clsReported.toFixed(3)}).`
    )
  }
  console.log(`\n  FCP                ${ms(summary.metrics.fcp)}`)
  console.log(`  TTI                ${ms(summary.metrics.tti)}`)
  console.log(`  Transfer           ${kb(summary.diagnostics.transferBytes)}`)
  console.log(`  Main-thread work   ${ms(summary.diagnostics.mainThreadMs)}`)
  console.log(`  Unused JS          ${kb(summary.diagnostics.unusedJsBytes)}`)
  console.log(`  Unused CSS         ${kb(summary.diagnostics.unusedCssBytes)}`)
  console.log(`  Oversized images   ${kb(summary.diagnostics.imageSavingsBytes)}`)

  mkdirSync(OUT_DIR, { recursive: true })
  const outFile = join(OUT_DIR, `lighthouse-${summary.generatedAt.replace(/[:.]/g, '-')}.json`)
  writeFileSync(outFile, JSON.stringify(summary, null, 2))
  console.log(`\n  Written to ${relative(ROOT, outFile).replace(/\\/g, '/')}\n`)

  stopPreview()
  process.exit(failed > 0 ? 1 : 0)
} catch (error) {
  stopPreview()
  console.error(`\n${error.message}\n`)
  if (String(error.message).includes('ENOENT')) {
    console.error('npx could not run lighthouse. Check that Chrome or Edge is installed.')
  }
  process.exit(1)
}
