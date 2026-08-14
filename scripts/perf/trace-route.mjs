/**
 * Request-waterfall trace for an authenticated route.
 *
 * Lighthouse runs signed out, so the expensive half of this app — the
 * dashboard, with ~40 Supabase requests across several dependent levels — has
 * never been measurable by the rest of this harness. This drives a real browser
 * over the DevTools protocol instead, seeds a session, loads a route, and
 * reports every request with when it started, how long it took, and what
 * triggered it.
 *
 * What it answers that a request COUNT cannot: the waterfall DEPTH. Twelve
 * requests issued at once cost one round trip; twelve issued in a chain cost
 * twelve. Only the second is a latency problem, and on a mobile link it is
 * usually the whole problem.
 *
 *   node scripts/perf/trace-route.mjs                     # /dashboard
 *   node scripts/perf/trace-route.mjs --route /projects
 *   node scripts/perf/trace-route.mjs --url https://…     # a deploy
 *   node scripts/perf/trace-route.mjs --anon              # skip sign-in
 *
 * Credentials come from .env.perf (gitignored), never from arguments — an
 * argument would land in shell history and in this process's command line.
 * Either form works:
 *
 *   PERF_SESSION={"access_token":"…","refresh_token":"…",…}
 *
 *     The whole value of the `sb-<ref>-auth-token` key from a signed-in
 *     browser's localStorage (DevTools → Application → Local Storage). This is
 *     the ONLY option for an account created through Google or Microsoft SSO,
 *     which has no password to exchange. It is also the safer one generally: a
 *     scoped token that expires, rather than a reusable credential.
 *
 *   PERF_EMAIL=someone@example.com
 *   PERF_PASSWORD=…
 *
 *     Email/password accounts only. Exchanged once against the same public
 *     token endpoint the login form uses.
 *
 * Zero dependencies: Node 22+ ships a global WebSocket, which is all CDP needs.
 * The password is used once against Supabase's token endpoint and never
 * printed; the access token is redacted everywhere it would otherwise appear.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const ROOT = process.cwd()
const OUT_DIR = join(ROOT, 'docs', 'perf')
mkdirSync(OUT_DIR, { recursive: true })

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const has = (name) => argv.includes(`--${name}`)

const route = flag('route', '/dashboard')
const baseUrl = flag('url', 'http://localhost:4173')
const anon = has('anon')
const PORT = 9333

// ---------------------------------------------------------------- env loading

/** Minimal .env reader — no dependency, and it must not choke on `=` in a value. */
function readEnvFile(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const appEnv = readEnvFile(join(ROOT, '.env'))
const perfEnv = readEnvFile(join(ROOT, '.env.perf'))

const SUPABASE_URL = appEnv.VITE_SUPABASE_URL
const SUPABASE_ANON = appEnv.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}
/** `https://abcd.supabase.co` → `abcd`, which is what supabase-js keys storage by. */
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0]

// ------------------------------------------------------------------ sign-in

/**
 * Exchange a password for a session, exactly as the app's client would.
 *
 * Read-only against the project: this is the same public token endpoint the
 * login form uses, with the anon key. It creates no rows.
 */
async function signIn() {
  const { PERF_SESSION, PERF_EMAIL, PERF_PASSWORD } = perfEnv

  // A pasted session wins: it needs no network call at all, and it is the only
  // route for an SSO account, which has no password to exchange.
  if (PERF_SESSION) {
    let raw = PERF_SESSION.trim()

    // DevTools' Local Storage TABLE truncates a long value and copies the
    // ellipsis with it, so the paste looks plausible and parses as nothing.
    // Worth naming explicitly — the generic "not valid JSON" sends you looking
    // at the wrong thing entirely.
    if (/[…]|\.\.\.$/.test(raw)) {
      console.error('PERF_SESSION is truncated — it contains an ellipsis.')
      console.error('The Local Storage table cuts long values off when copied.')
      console.error('In the DevTools Console instead, run:')
      console.error(
        "  copy(Object.keys(localStorage).filter(k=>k.startsWith('sb-')&&k.includes('auth-token')).sort().map(k=>localStorage[k]).join(''))"
      )
      process.exit(1)
    }

    // Newer supabase-js writes `base64-<payload>`, and chunks very long values
    // across `…auth-token.0`, `.1`. The console snippet above concatenates the
    // chunks; this undoes the encoding.
    if (raw.startsWith('base64-')) {
      try {
        raw = Buffer.from(raw.slice('base64-'.length), 'base64').toString('utf8')
      } catch {
        console.error('PERF_SESSION looked base64-encoded but could not be decoded.')
        process.exit(1)
      }
    }

    let session
    try {
      session = JSON.parse(raw)
    } catch {
      console.error('PERF_SESSION is not valid JSON. Use the console snippet:')
      console.error(
        "  copy(Object.keys(localStorage).filter(k=>k.startsWith('sb-')&&k.includes('auth-token')).sort().map(k=>localStorage[k]).join(''))"
      )
      process.exit(1)
    }
    // Some supabase-js versions wrap it as { currentSession: … }; accept both.
    session = session.currentSession ?? session
    if (!session.access_token) {
      console.error('PERF_SESSION has no access_token — is that the sb-<ref>-auth-token value?')
      process.exit(1)
    }
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
    if (expiresAt && expiresAt < Date.now()) {
      console.log('Note: pasted session is past its expiry; the app will refresh it on load.')
    }
    return session
  }

  if (!PERF_EMAIL || !PERF_PASSWORD) {
    console.error('Missing PERF_SESSION, or PERF_EMAIL / PERF_PASSWORD, in .env.perf.')
    console.error('SSO accounts (Google/Microsoft) must use PERF_SESSION — see this file\'s header.')
    console.error('Or pass --anon to trace the route signed out.')
    process.exit(1)
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: PERF_EMAIL, password: PERF_PASSWORD }),
  })
  if (!res.ok) {
    // Body may quote the email; status alone is enough to act on.
    console.error(`Sign-in failed: HTTP ${res.status}. Check .env.perf.`)
    process.exit(1)
  }
  const session = await res.json()
  // supabase-js expects an absolute expiry; the endpoint only guarantees the
  // relative one.
  if (!session.expires_at && session.expires_in) {
    session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in
  }
  return session
}

// ---------------------------------------------------------------------- CDP

function resolveBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const local = process.env.LOCALAPPDATA ?? ''
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          join(local, 'Google\\Chrome\\Application\\chrome.exe'),
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge']
  return candidates.find((p) => existsSync(p)) ?? null
}

let browser = null
const profileDir = join(tmpdir(), `ktip-perf-${process.pid}`)

function launch() {
  const bin = resolveBrowser()
  if (!bin) {
    console.error('No Chrome or Edge found. Set CHROME_PATH.')
    process.exit(1)
  }
  browser = spawn(
    bin,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--no-sandbox',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )
}

function killBrowser() {
  if (!browser) return
  try {
    if (process.platform === 'win32')
      execFileSync('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { stdio: 'ignore' })
    else browser.kill('SIGTERM')
  } catch {
    // Already gone.
  }
  try {
    rmSync(profileDir, { recursive: true, force: true })
  } catch {
    // Windows keeps a handle on the profile briefly; a stale temp dir is harmless.
  }
}

async function pageSocketUrl() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('browser did not expose a debugging target within 20s')
}

/** Promise-based CDP client over one page target. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map()
  const listeners = new Map()
  let nextId = 1

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
      return
    }
    const handlers = listeners.get(msg.method)
    if (handlers) for (const h of handlers) h(msg.params)
  })

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')))
  })

  return {
    ready,
    send(method, params = {}) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    on(method, handler) {
      if (!listeners.has(method)) listeners.set(method, [])
      listeners.get(method).push(handler)
    },
    close: () => ws.close(),
  }
}

// -------------------------------------------------------------------- report

const kb = (n) => `${(n / 1024).toFixed(1)} kB`

/**
 * Longest chain of requests where each one only STARTED after the previous
 * finished. That is the number of serial round trips the route costs, which is
 * what a high-latency link multiplies — as opposed to the raw count, which
 * parallelism makes almost free.
 */
function waterfallDepth(requests) {
  const sorted = [...requests].sort((a, b) => a.start - b.start)
  const depth = new Array(sorted.length).fill(1)
  let best = 0
  for (let i = 0; i < sorted.length; i++) {
    for (let j = 0; j < i; j++) {
      // 20ms of slack: two requests dispatched in the same tick can report
      // start times either side of a predecessor's end by a rounding margin.
      if (sorted[j].end <= sorted[i].start - 20 && depth[j] + 1 > depth[i]) {
        depth[i] = depth[j] + 1
      }
    }
    if (depth[i] > best) best = depth[i]
  }
  return best
}

// ---------------------------------------------------------------------- main

try {
  const session = anon ? null : await signIn()
  if (session) {
    // Identify the account without printing a token or a full address.
    const who = session.user?.email ?? perfEnv.PERF_EMAIL ?? 'session'
    console.log(`Using session for ${String(who).replace(/(.).*(@.*)/, '$1***$2')}`)
  }

  launch()
  const client = connect(await pageSocketUrl())
  await client.ready

  await client.send('Network.enable')
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  // Cold load every time, or the second run measures the service worker.
  await client.send('Network.setCacheDisabled', { cacheDisabled: true })

  const inflight = new Map()
  const requests = []
  let collecting = false

  client.on('Network.requestWillBeSent', (p) => {
    if (!collecting) return
    inflight.set(p.requestId, {
      url: p.request.url,
      method: p.request.method,
      start: p.timestamp * 1000,
      initiator: p.initiator?.type ?? 'other',
    })
  })
  const finish = (p, failed) => {
    if (!collecting) return
    const rec = inflight.get(p.requestId)
    if (!rec) return
    inflight.delete(p.requestId)
    rec.end = p.timestamp * 1000
    rec.bytes = p.encodedDataLength ?? 0
    rec.failed = failed
    requests.push(rec)
  }
  client.on('Network.loadingFinished', (p) => finish(p, false))
  client.on('Network.loadingFailed', (p) => finish(p, true))

  const origin = new URL(baseUrl).origin

  // Seed the session on the app's own origin. localStorage is origin-scoped, so
  // this has to happen on a page already at that origin — hence the throwaway
  // navigation before the one being measured.
  await client.send('Page.navigate', { url: origin })
  await new Promise((r) => setTimeout(r, 1500))

  if (session) {
    const key = `sb-${PROJECT_REF}-auth-token`
    await client.send('Runtime.evaluate', {
      expression: `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(
        JSON.stringify(session)
      )})`,
      awaitPromise: false,
    })
  }

  const target = new URL(route, baseUrl).href
  console.log(`\nTracing ${target}${session ? '' : ' (signed out)'}\n`)

  collecting = true
  const t0 = Date.now()
  await client.send('Page.navigate', { url: target })

  // Settle on quiet rather than on `load`: the whole point is the requests that
  // fire AFTER load, from effects and from queries gated on other queries.
  let lastActivity = Date.now()
  const seen = () => (lastActivity = Date.now())
  client.on('Network.requestWillBeSent', seen)
  client.on('Network.loadingFinished', seen)
  while (Date.now() - lastActivity < 3000 && Date.now() - t0 < 45_000) {
    await new Promise((r) => setTimeout(r, 250))
  }
  collecting = false

  const base = Math.min(...requests.map((r) => r.start))
  for (const r of requests) {
    r.offset = Math.round(r.start - base)
    r.duration = Math.round(r.end - r.start)
  }

  const isSupabase = (r) => r.url.includes('/rest/v1/') || r.url.includes('/rpc/')
  const supabase = requests.filter(isSupabase).sort((a, b) => a.offset - b.offset)
  const authed = requests.some((r) => /\/rest\/v1\/profiles/.test(r.url))

  if (session && !authed) {
    console.log('WARNING: no profiles request seen — the session may not have been accepted.')
    console.log('The numbers below are probably a signed-out load.\n')
  }

  console.log(`  Supabase data requests: ${supabase.length}`)
  console.log(`  Waterfall depth (serial round trips): ${waterfallDepth(supabase)}`)
  console.log(`  Total requests: ${requests.length}`)
  console.log(
    `  Supabase bytes: ${kb(supabase.reduce((n, r) => n + r.bytes, 0))}\n`
  )

  console.log('  start   dur   size      endpoint')
  console.log('  ' + '─'.repeat(76))
  for (const r of supabase) {
    const path = r.url.replace(/^https:\/\/[^/]+\/rest\/v1\//, '').slice(0, 58)
    console.log(
      `  ${String(r.offset).padStart(5)}ms ${String(r.duration).padStart(5)}ms ${kb(r.bytes).padStart(9)}  ${path}`
    )
  }

  const outFile = join(OUT_DIR, `route-${route.replace(/\W+/g, '-')}-${Date.now()}.json`)
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        route: target,
        authenticated: authed,
        supabaseRequests: supabase.length,
        waterfallDepth: waterfallDepth(supabase),
        totalRequests: requests.length,
        // Query strings only; no tokens are ever in a REST URL, but the
        // Authorization header is never captured either way.
        requests: supabase.map(({ url, offset, duration, bytes, initiator }) => ({
          url: url.replace(/^https:\/\/[^/]+/, ''),
          offset,
          duration,
          bytes,
          initiator,
        })),
      },
      null,
      2
    )
  )
  console.log(`\n  Written to ${relative(ROOT, outFile).replace(/\\/g, '/')}\n`)

  client.close()
  killBrowser()
  process.exit(0)
} catch (error) {
  killBrowser()
  console.error(`\n${error.message}\n`)
  process.exit(1)
}
