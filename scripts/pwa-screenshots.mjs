// Captures the manifest `screenshots` for the install dialog.
// Usage: node node_modules/vite/bin/vite.js preview & node scripts/pwa-screenshots.mjs
//
// Android's install prompt has two shapes. Without screenshots it is a one-line
// chip; with a narrow AND a wide one it becomes a rich card carrying the app
// name, description and a preview. That card is the difference between "add
// shortcut?" and something that reads like installing an app, so these are not
// decoration — they are why the manifest work lands.
//
// Driven over CDP for the same reason scripts/perf/trace-route.mjs is: it needs
// a real engine, and Node 22+ ships a WebSocket, so no dependency is required.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import sharp from 'sharp'
import { join } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'public', 'screenshots')
mkdirSync(OUT, { recursive: true })

const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:4173'
const PORT = 9444

/** Dimensions are declared in manifest.json and must match these exactly. */
const SHOTS = [
  { name: 'mobile-discover', route: '/', width: 412, height: 823, factor: 'narrow' },
  { name: 'desktop-discover', route: '/', width: 1280, height: 800, factor: 'wide' },
]

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
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/chromium']
  return candidates.find((p) => existsSync(p)) ?? null
}

const profileDir = join(tmpdir(), `ktip-shots-${process.pid}`)
let browser = null

function killBrowser() {
  if (!browser) return
  try {
    if (process.platform === 'win32')
      execFileSync('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { stdio: 'ignore' })
    else browser.kill('SIGTERM')
  } catch {
    /* already gone */
  }
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map()
  let nextId = 1
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    }
  })
  return {
    ready: new Promise((res, rej) => {
      ws.addEventListener('open', res)
      ws.addEventListener('error', () => rej(new Error('CDP socket failed')))
    }),
    send(method, params = {}) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    close: () => ws.close(),
  }
}

try {
  const bin = resolveBrowser()
  if (!bin) throw new Error('No Chrome or Edge found. Set CHROME_PATH.')

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
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  let wsUrl = null
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline && !wsUrl) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null
    } catch {
      /* not up yet */
    }
    if (!wsUrl) await new Promise((r) => setTimeout(r, 250))
  }
  if (!wsUrl) throw new Error('browser did not expose a debugging target')

  const client = connect(wsUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')

  // Settle the analytics consent first: it is a full-width bottom sheet on a
  // phone, and a store-style screenshot of the app should show the app, not a
  // dialog. 'denied' rather than 'granted' — nothing here should look like it
  // opted a user in.
  await client.send('Page.navigate', { url: new URL('/', BASE).href })
  await new Promise((r) => setTimeout(r, 1500))
  await client.send('Runtime.evaluate', {
    expression: "localStorage.setItem('ktip_analytics_consent_v1','denied')",
  })

  const manifestEntries = []
  for (const shot of SHOTS) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: shot.width,
      height: shot.height,
      deviceScaleFactor: 1,
      mobile: shot.factor === 'narrow',
    })
    await client.send('Page.navigate', { url: new URL(shot.route, BASE).href })
    // Fixed settle: the landing hero reveals on a JS-gated opacity transition
    // and a screenshot taken before it lands is a navy rectangle.
    await new Promise((r) => setTimeout(r, 4000))

    const { data } = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    })

    // WebP, not the raw PNG. These are photographs of a photograph-led page, so
    // PNG is the wrong container entirely — the desktop capture is ~966 kB as
    // PNG and a fraction of that as WebP, and these files live in the repo.
    // Chromium is the only engine that renders manifest screenshots and has
    // supported WebP for years.
    const file = join(OUT, `${shot.name}.webp`)
    writeFileSync(
      file,
      await sharp(Buffer.from(data, 'base64')).webp({ quality: 80, effort: 6 }).toBuffer()
    )
    const { size } = await stat(file)
    console.log(
      `  ${shot.name}.webp  ${shot.width}x${shot.height}  ${shot.factor}  ${(size / 1024).toFixed(1)} kB`
    )
    manifestEntries.push({
      src: `/screenshots/${shot.name}.webp`,
      sizes: `${shot.width}x${shot.height}`,
      type: 'image/webp',
      form_factor: shot.factor,
    })
  }

  console.log('\nmanifest.json "screenshots" should read:\n')
  console.log(JSON.stringify(manifestEntries, null, 2))

  client.close()
  killBrowser()
  process.exit(0)
} catch (error) {
  killBrowser()
  console.error(`\n${error.message}\n`)
  process.exit(1)
}
