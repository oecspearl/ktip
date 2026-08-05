import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Responsive preview harness — dev only, never routed in a production build.
 *
 * The app renders identically from 1280px to 2560px unless something asks a
 * wide screen for different sizes, and the only way to see whether the scale
 * ramps do that is to look at several widths at once. Resizing one window
 * shows you a width at a time and forgets the last one.
 *
 * Each device is a real iframe at its true CSS width, scaled down purely for
 * display, so the media queries inside it fire against the width being
 * previewed rather than the browser's. The readout is measured out of those
 * iframes — a probe element per token, asking the browser what it computed —
 * rather than restating the numbers from index.css, which would let the table
 * agree with itself while disagreeing with the app.
 *
 * Solo mode answers the other question the grid cannot: "is this text too small
 * to read on my actual laptop?" A frame at 32% is the right shape and the wrong
 * size, so judging legibility from it is meaningless. Solo renders one device
 * at 1:1 filling the whole screen — and deliberately CROPS anything wider than
 * the real display rather than scaling it down, because a scaled-down 2560 frame
 * would once again show text at a size nobody will ever look at.
 */

interface Device {
  label: string
  note: string
  width: number
  height: number
}

/** Mirrors the ramp steps in index.css, plus the two phone sizes below them. */
const DEVICES: Device[] = [
  { label: 'Phone', note: 'iPhone portrait', width: 375, height: 812 },
  { label: 'Phone L', note: 'large phone', width: 430, height: 932 },
  { label: 'Tablet', note: 'iPad portrait', width: 768, height: 1024 },
  { label: 'Tablet L', note: 'iPad landscape', width: 1024, height: 768 },
  { label: 'Laptop 13"', note: '1280 wide', width: 1280, height: 800 },
  { label: 'Laptop 14–16"', note: 'ramp anchor — all scales = 1', width: 1440, height: 900 },
  { label: 'Laptop 16" scaled', note: '1680 wide', width: 1680, height: 1050 },
  { label: 'Desktop 1080p', note: '1920 wide', width: 1920, height: 1080 },
  { label: 'Your monitor', note: '2560x1600 — design target', width: 2560, height: 1600 },
]

/** Tokens sampled in the readout, in ladder order. */
const TYPE_TOKENS = [
  'text-micro',
  'text-caption',
  'text-label',
  'text-body',
  'text-body-lg',
  'text-title-sm',
  'text-title',
  'text-title-lg',
  'text-display-sm',
  'text-display',
]

const BOX_TOKENS = [
  { cls: 'p-card-pad', prop: 'paddingTop', label: 'card padding' },
  { cls: 'min-h-tile-min', prop: 'minHeight', label: 'tile min-height' },
  { cls: 'min-h-control-md', prop: 'minHeight', label: 'control height' },
  { cls: 'size-icon', prop: 'width', label: 'icon' },
  { cls: 'gap-4', prop: 'rowGap', label: 'gap-4 (stock)' },
  { cls: 'p-6', prop: 'paddingTop', label: 'p-6 (stock)' },
]

const PRESETS = ['/', '/events', '/projects', '/directory', '/resources', '/grants', '/help/faq']

type Fit = { pageOverflow: number; navOverflow: number; navHeight: number }
type Measurement = {
  scales: Record<string, string>
  type: Record<string, number>
  box: Record<string, number>
  fit: Fit
}

/**
 * Horizontal overflow and navbar wrapping, measured rather than eyeballed.
 *
 * A bar whose contents no longer fit does not report an error — it wraps, and
 * you only notice by looking at the right width. Comparing scrollWidth against
 * clientWidth catches it at every width at once, and the same check on the
 * document catches a fixed-width element forcing the whole page to scroll
 * sideways on a phone.
 */
function measureFit(doc: Document): Fit {
  const nav = doc.querySelector('header, nav') as HTMLElement | null
  const inner = nav?.querySelector<HTMLElement>('div > div') ?? null
  return {
    pageOverflow: Math.max(0, Math.round(doc.documentElement.scrollWidth - doc.documentElement.clientWidth)),
    navOverflow: inner ? Math.max(0, Math.round(inner.scrollWidth - inner.clientWidth)) : 0,
    // The bar is a fixed h-[var(--nav-h)]; content taller than that has wrapped.
    navHeight: nav ? Math.round(nav.getBoundingClientRect().height) : 0,
  }
}

/**
 * Reads what the browser actually computed inside a frame. Values come from
 * probe elements carrying the real utility classes, so a token that failed to
 * generate shows up as a wrong number here instead of passing silently.
 */
function measure(frame: HTMLIFrameElement): Measurement | null {
  const doc = frame.contentDocument
  if (!doc?.body) return null

  const host = doc.createElement('div')
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden'
  doc.body.appendChild(host)

  const read = (className: string, prop: string) => {
    const probe = doc.createElement('div')
    probe.className = className
    host.appendChild(probe)
    const value = parseFloat(doc.defaultView!.getComputedStyle(probe)[prop as never] as string)
    return Math.round(value * 10) / 10
  }

  const type: Record<string, number> = {}
  for (const token of TYPE_TOKENS) type[token] = read(token, 'fontSize')

  const box: Record<string, number> = {}
  for (const { cls, prop, label } of BOX_TOKENS) box[label] = read(cls, prop)

  const rootStyle = doc.defaultView!.getComputedStyle(doc.documentElement)
  const scales: Record<string, string> = {}
  for (const ramp of ['--scale-display', '--scale-layout', '--scale-text']) {
    scales[ramp] = rootStyle.getPropertyValue(ramp).trim() || '—'
  }

  host.remove()
  return { scales, type, box, fit: measureFit(doc) }
}

function DeviceFrame({
  device,
  path,
  zoom,
  onMeasure,
  onSolo,
}: {
  device: Device
  path: string
  zoom: number
  onMeasure: (label: string, m: Measurement | null) => void
  onSolo: (device: Device) => void
}) {
  const ref = useRef<HTMLIFrameElement>(null)

  const handleLoad = useCallback(() => {
    // A frame that has only just fired load may not have applied stylesheets
    // yet; one frame of delay is enough and avoids reading zeros.
    requestAnimationFrame(() => {
      if (ref.current) onMeasure(device.label, measure(ref.current))
    })
  }, [device.label, onMeasure])

  return (
    <div className="shrink-0">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-label font-semibold text-ktip-sand-900">{device.label}</span>
        <span className="text-micro text-ktip-sand-500">
          {device.width}x{device.height} · {device.note}
        </span>
        <button
          type="button"
          onClick={() => onSolo(device)}
          className="ml-auto rounded-control border border-ktip-sand-200 bg-ktip-cream px-2 py-1 text-micro font-semibold text-ktip-sand-700 transition-colors hover:bg-ktip-sand-50"
        >
          Full screen
        </button>
      </div>
      <div
        className="overflow-hidden rounded-surface border border-ktip-sand-300 bg-ktip-cream shadow-medium"
        style={{ width: device.width * zoom, height: device.height * zoom }}
      >
        <iframe
          ref={ref}
          src={path}
          title={`${device.label} preview`}
          onLoad={handleLoad}
          // Rendered at true size then scaled, so the media queries inside see
          // the device width. Setting the iframe to the scaled size instead
          // would preview the wrong breakpoint entirely.
          style={{
            width: device.width,
            height: device.height,
            border: 0,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  )
}

/** Live size of the real browser viewport, so "This screen" is honest. */
function useViewport() {
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }))
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

/**
 * One device, 1:1, over the whole screen.
 *
 * Cropping is the feature. Scaling a 2560 frame down to fit a 1440 laptop makes
 * every measurement in it a lie — the point of this mode is to see the real
 * pixel size of real text, so anything past the edge of the display simply is
 * not shown, exactly as it would not be on a narrower machine. `Fit` is there
 * for when you want the whole layout back and accept that sizes stop being
 * trustworthy.
 */
function SoloView({
  device,
  devices,
  path,
  viewport,
  onPickDevice,
  onClose,
}: {
  device: Device
  devices: Device[]
  path: string
  viewport: { width: number; height: number }
  onPickDevice: (device: Device) => void
  onClose: () => void
}) {
  const [fit, setFit] = useState(false)
  const [chrome, setChrome] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key.toLowerCase() === 'h') setChrome((c) => !c)
    }
    window.addEventListener('keydown', onKey)
    // The page behind must not scroll while an overlay owns the screen.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const scale = fit ? Math.min(1, viewport.width / device.width, viewport.height / device.height) : 1
  const cropX = Math.max(0, device.width - Math.round(viewport.width / scale))
  const cropY = Math.max(0, device.height - Math.round(viewport.height / scale))

  return (
    <div className="fixed inset-0 z-max overflow-hidden bg-black">
      {/* Not keyed on the device: resizing the frame lets the media queries
          inside re-fire live, which is the whole point and cheaper than a
          reload every time you tap another width. */}
      <iframe
        src={path}
        title={`${device.label} full screen`}
        style={{
          width: device.width,
          height: device.height,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />

      {chrome && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-surface border border-white/15 bg-black/80 px-3 py-2 text-micro text-white shadow-medium backdrop-blur">
            <span className="font-semibold">{device.label}</span>
            <span className="text-white/60">
              {device.width}x{device.height} @ {Math.round(scale * 100)}%
            </span>
            <span className="text-white/40">|</span>
            <span className="text-white/60">
              screen {viewport.width}x{viewport.height}
            </span>
            {(cropX > 0 || cropY > 0) && (
              <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-semibold text-amber-300">
                cropped {cropX > 0 ? `${cropX}px right` : ''}
                {cropX > 0 && cropY > 0 ? ' · ' : ''}
                {cropY > 0 ? `${cropY}px bottom` : ''}
              </span>
            )}

            <span className="mx-1 h-4 w-px bg-white/20" />

            {devices.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => onPickDevice(d)}
                className={`rounded px-2 py-1 transition-colors ${
                  d.label === device.label
                    ? 'bg-white text-black font-semibold'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {d.label === 'This screen' ? 'mine' : d.width}
              </button>
            ))}

            <span className="mx-1 h-4 w-px bg-white/20" />

            <button
              type="button"
              onClick={() => setFit((f) => !f)}
              className={`rounded px-2 py-1 transition-colors ${
                fit ? 'bg-white text-black font-semibold' : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              {fit ? 'Fit' : '1:1'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen()
                else void document.documentElement.requestFullscreen()
              }}
              className="rounded bg-white/10 px-2 py-1 text-white/80 transition-colors hover:bg-white/20"
            >
              Browser fullscreen
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-white/10 px-2 py-1 text-white/80 transition-colors hover:bg-white/20"
            >
              Close (Esc)
            </button>
            <span className="text-white/40">H hides this bar</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ResponsivePreviewPage() {
  const [path, setPath] = useState('/')
  const [pending, setPending] = useState('/')
  const [zoom, setZoom] = useState(0.32)
  const [measurements, setMeasurements] = useState<Record<string, Measurement | null>>({})
  const [solo, setSolo] = useState<Device | null>(null)
  const [tableOpen, setTableOpen] = useState(true)
  const viewport = useViewport()

  /** The machine you are actually sitting at, offered as a device like any other. */
  const thisScreen: Device = {
    label: 'This screen',
    note: 'your browser viewport, 1:1',
    width: viewport.width,
    height: viewport.height,
  }

  const onMeasure = useCallback((label: string, m: Measurement | null) => {
    setMeasurements((prev) => ({ ...prev, [label]: m }))
  }, [])

  useEffect(() => {
    document.title = 'Responsive preview'
  }, [])

  const shown = DEVICES.filter((d) => measurements[d.label])

  return (
    <div className="min-h-screen bg-ktip-canvas p-card-pad-lg">
      <header className="mb-6">
        <h1 className="text-title-lg font-display font-extrabold text-ktip-sand-900">
          Responsive preview
        </h1>
        <p className="mt-1 text-body text-ktip-sand-600">
          Every frame is the real app at that exact CSS width. Sizes below are measured out of the
          frames, not copied from the stylesheet.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setMeasurements({})
            setPath(pending.startsWith('/') ? pending : `/${pending}`)
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-label font-medium text-ktip-sand-700">Path</span>
            <input
              value={pending}
              onChange={(e) => setPending(e.target.value)}
              className="w-72 rounded-control border border-ktip-sand-200 bg-ktip-sand-50/50 px-4 py-3 text-body"
            />
          </label>
          <button
            type="submit"
            className="btn-brand rounded-control px-6 py-3 text-body font-medium min-h-control-md"
          >
            Load
          </button>
        </form>

        <label className="flex flex-col gap-1.5">
          <span className="text-label font-medium text-ktip-sand-700">Zoom {Math.round(zoom * 100)}%</span>
          <input
            type="range"
            min={12}
            max={100}
            value={zoom * 100}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            className="w-56"
          />
        </label>

        <button
          type="button"
          onClick={() => setSolo(thisScreen)}
          className="btn-brand rounded-control px-6 py-3 text-body font-medium min-h-control-md"
        >
          Full screen — this screen ({viewport.width}×{viewport.height})
        </button>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => {
              setPending(preset)
              setMeasurements({})
              setPath(preset)
            }}
            className={`rounded-control border px-3 py-1.5 text-label transition-colors ${
              path === preset
                ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                : 'border-ktip-sand-200 bg-ktip-cream text-ktip-sand-700 hover:bg-ktip-sand-50'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="mb-10 flex gap-6 overflow-x-auto pb-4">
        {DEVICES.map((device) => (
          <DeviceFrame
            key={`${device.label}-${path}`}
            device={device}
            path={path}
            zoom={zoom}
            onMeasure={onMeasure}
            onSolo={setSolo}
          />
        ))}
      </div>

      {shown.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setTableOpen((open) => !open)}
            aria-expanded={tableOpen}
            className="mb-3 flex items-center gap-2 text-title font-display font-bold text-ktip-sand-900"
          >
            <span
              aria-hidden
              className={`inline-block text-title-sm transition-transform ${tableOpen ? 'rotate-90' : ''}`}
            >
              ›
            </span>
            Measured sizes
            <span className="text-caption font-sans font-normal text-ktip-sand-500">
              {tableOpen ? 'hide' : `show — ${shown.length} widths`}
            </span>
          </button>
          <div
            hidden={!tableOpen}
            className="overflow-x-auto rounded-surface border border-ktip-sand-200 bg-ktip-cream"
          >
            <table className="w-full border-collapse text-label tabular-nums">
              <thead>
                <tr className="border-b border-ktip-sand-200 text-left">
                  <th className="px-4 py-3 font-semibold text-ktip-sand-700">Token</th>
                  {shown.map((d) => (
                    <th key={d.label} className="px-3 py-3 text-right font-semibold text-ktip-sand-700">
                      {d.width}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-ktip-sand-200">
                  <td className="px-4 py-2 font-semibold text-ktip-sand-700">page overflow</td>
                  {shown.map((d) => {
                    const px = measurements[d.label]?.fit.pageOverflow ?? 0
                    return (
                      <td
                        key={d.label}
                        className={`px-3 py-2 text-right ${px > 0 ? 'font-bold text-red-600' : 'text-ktip-tropical-700'}`}
                      >
                        {px > 0 ? `+${px}` : 'ok'}
                      </td>
                    )
                  })}
                </tr>
                <tr className="border-b border-ktip-sand-200">
                  <td className="px-4 py-2 font-semibold text-ktip-sand-700">navbar fits</td>
                  {shown.map((d) => {
                    const fit = measurements[d.label]?.fit
                    const bad = (fit?.navOverflow ?? 0) > 0
                    return (
                      <td
                        key={d.label}
                        className={`px-3 py-2 text-right ${bad ? 'font-bold text-red-600' : 'text-ktip-tropical-700'}`}
                      >
                        {bad ? `+${fit!.navOverflow}` : 'ok'}
                      </td>
                    )
                  })}
                </tr>
                {['--scale-display', '--scale-layout', '--scale-text'].map((ramp) => (
                  <tr key={ramp} className="border-b border-ktip-sand-100 bg-ktip-sand-50/40">
                    <td className="px-4 py-2 font-mono text-micro text-ktip-sand-600">{ramp}</td>
                    {shown.map((d) => (
                      <td key={d.label} className="px-3 py-2 text-right text-ktip-sand-800">
                        {measurements[d.label]?.scales[ramp]}
                      </td>
                    ))}
                  </tr>
                ))}
                {TYPE_TOKENS.map((token) => (
                  <tr key={token} className="border-b border-ktip-sand-100">
                    <td className="px-4 py-2 font-mono text-micro text-ktip-sand-600">{token}</td>
                    {shown.map((d) => {
                      const px = measurements[d.label]?.type[token]
                      // 13px is the floor the migration exists to enforce; the
                      // whole point of the table is being able to see a breach.
                      const tooSmall = typeof px === 'number' && px < 13
                      return (
                        <td
                          key={d.label}
                          className={`px-3 py-2 text-right ${
                            tooSmall ? 'font-bold text-red-600' : 'text-ktip-sand-800'
                          }`}
                        >
                          {px}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {BOX_TOKENS.map(({ label }) => (
                  <tr key={label} className="border-b border-ktip-sand-100 bg-ktip-sand-50/40">
                    <td className="px-4 py-2 font-mono text-micro text-ktip-sand-600">{label}</td>
                    {shown.map((d) => (
                      <td key={d.label} className="px-3 py-2 text-right text-ktip-sand-800">
                        {measurements[d.label]?.box[label]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tableOpen && (
            <p className="mt-2 text-caption text-ktip-sand-500">
              Red marks anything under the 13px readability floor. Stock <code>p-6</code> and{' '}
              <code>gap-4</code> are included to show the global <code>--spacing</code> override
              reaching utilities nothing migrated.
            </p>
          )}
        </section>
      )}

      {solo && (
        <SoloView
          device={solo.label === 'This screen' ? thisScreen : solo}
          devices={[thisScreen, ...DEVICES]}
          path={path}
          viewport={viewport}
          onPickDevice={setSolo}
          onClose={() => setSolo(null)}
        />
      )}
    </div>
  )
}
