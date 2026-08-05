import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
 * Devices are described the way people describe their machines — `14" laptop`,
 * not `1280` — because nobody reports a bug as "the layout is wrong at 1280".
 * The CSS width is derived from the panel and its OS scaling rather than typed
 * in, since that derivation is the thing people get wrong: a 14" laptop with a
 * 1920x1080 panel at Windows' default 150% is a 1280px viewport, not a 1920px
 * one, and roughly 610px tall once the browser's own chrome is subtracted.
 *
 * Solo mode answers the other question the grid cannot: "is this text too small
 * to read on my actual laptop?" A frame at 32% is the right shape and the wrong
 * size, so judging legibility from it is meaningless. Solo renders one device
 * at 1:1 filling the whole screen — and deliberately CROPS anything wider than
 * the real display rather than scaling it down, because a scaled-down 2560 frame
 * would once again show text at a size nobody will ever look at.
 *
 * The pt readout answers it a third way, without leaving the desk. Two screens
 * showing the same CSS px show text at different PHYSICAL sizes whenever their
 * pixel densities differ, so `16px` says nothing about whether a reader can see
 * it. Points are absolute — 1/72", the unit print has used for centuries — so
 * the same number in two columns means the same size to an eye, and a column
 * that drops several points below the rest is the machine people complain about.
 */

type Group = 'phone' | 'tablet' | 'laptop' | 'desktop'

interface Device {
  id: string
  /** How its owner would describe it. */
  label: string
  /** Panel and OS scaling, spelled out — the derivation people get wrong. */
  detail: string
  group: Group
  /** CSS px available to the page. */
  width: number
  height: number
  /** Native px per CSS px: OS display scaling, or a Mac's Retina backing scale. */
  dpr: number
  /** Physical panel diagonal, for the pt readout. */
  diagonalIn: number
  panelW: number
  panelH: number
}

/**
 * Vertical CSS px the browser's own UI takes off the panel.
 *
 * Height is the constraint people actually hit on a small laptop and the one a
 * width-only device list hides completely: a 14" 1080p panel at 150% is 720 CSS
 * px tall, and the page gets 610 of them. Chrome's tab strip plus omnibox is
 * ~88 CSS px with no bookmarks bar, Safari's unified bar ~78, and a phone's
 * address bar ~85 in its collapsed state.
 */
const CHROME: Record<Group, number> = { phone: 85, tablet: 90, laptop: 110, desktop: 110 }

/**
 * A device from what is printed on the box, not from a viewport size.
 *
 * `scale` is OS display scaling (Windows' 100/125/150%) or a Mac's effective
 * backing scale — 2560/1440 = 1.78 for a 13" Air at its default "looks like
 * 1440x900", which is why these are not round numbers.
 */
function device(
  id: string,
  label: string,
  group: Group,
  diagonalIn: number,
  panelW: number,
  panelH: number,
  scale: number,
  detail: string,
): Device {
  return {
    id,
    label,
    detail,
    group,
    diagonalIn,
    panelW,
    panelH,
    dpr: scale,
    width: Math.round(panelW / scale),
    height: Math.round(panelH / scale) - CHROME[group],
  }
}

/**
 * Real machines, described as their owners describe them.
 *
 * The laptop block is deliberately the crowded one. It is where the ramp steps
 * at 1280/1440/1680 land on top of each other, where OS scaling makes the CSS
 * width unguessable from the spec sheet, and where every complaint comes from.
 */
const DEVICES: Device[] = [
  device('phone', '6.1" phone', 'phone', 6.1, 1170, 2532, 3, 'iPhone, portrait'),
  device('phone-l', '6.7" phone', 'phone', 6.7, 1290, 2796, 3, 'large phone, portrait'),
  device('tablet', '10.9" tablet', 'tablet', 10.9, 1640, 2360, 2, 'iPad, portrait'),
  device('tablet-l', '10.9" tablet ↔', 'tablet', 10.9, 2360, 1640, 2, 'iPad, landscape'),

  device('l116', '11.6" netbook', 'laptop', 11.6, 1366, 768, 1, '1366x768 @ 100%'),
  device('l133-win', '13.3" laptop', 'laptop', 13.3, 1920, 1080, 1.5, '1920x1080 @ 150%'),
  device('l133-air', '13.6" MacBook Air', 'laptop', 13.6, 2560, 1664, 1.742, 'Retina, default scaling'),
  device('l14-150', '14" laptop', 'laptop', 14, 1920, 1080, 1.5, '1920x1080 @ 150% — the common one'),
  device('l14-1200', '14" laptop 16:10', 'laptop', 14, 1920, 1200, 1.5, '1920x1200 @ 150%'),
  device('l14-125', '14" laptop @125%', 'laptop', 14, 1920, 1080, 1.25, '1920x1080 @ 125%'),
  device('l142-mbp', '14.2" MacBook Pro', 'laptop', 14.2, 3024, 1964, 2, 'Retina, default scaling'),
  device('l156-100', '15.6" laptop', 'laptop', 15.6, 1920, 1080, 1, '1920x1080 @ 100%'),
  device('l156-125', '15.6" laptop @125%', 'laptop', 15.6, 1920, 1080, 1.25, '1920x1080 @ 125%'),
  device('l16-mbp', '16" MacBook Pro', 'laptop', 16, 3456, 2234, 2, 'Retina, default scaling'),

  device('d24', '24" monitor', 'desktop', 24, 1920, 1080, 1, '1080p @ 100%'),
  device('d27', '27" monitor', 'desktop', 27, 2560, 1440, 1, '1440p @ 100% — design target'),
  device('d27-4k', '27" 4K monitor', 'desktop', 27, 3840, 2160, 1.5, '4K @ 150%'),
  device('d32-4k', '32" 4K monitor', 'desktop', 32, 3840, 2160, 1.25, '4K @ 125%'),
]

const GROUPS: { key: Group; label: string }[] = [
  { key: 'phone', label: 'Phones' },
  { key: 'tablet', label: 'Tablets' },
  { key: 'laptop', label: 'Laptops' },
  { key: 'desktop', label: 'Desktops' },
]

/**
 * CSS px per physical inch, which is what makes a px count mean something.
 *
 * A panel's physical width comes from its diagonal and aspect ratio; dividing
 * the CSS width by it gives the density the reader's eye actually sees. 96 is
 * the notional baseline every `px` value is authored against.
 */
function pxPerInch(d: Device): number {
  const physicalWidthIn = (d.diagonalIn * d.panelW) / Math.hypot(d.panelW, d.panelH)
  return d.width / physicalWidthIn
}

/** CSS px → points (1/72"), so two columns are comparable to an eye. */
function toPt(px: number, cssPxPerIn: number): number {
  return (px * 72) / cssPxPerIn
}

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
  { cls: 'min-h-hero-band', prop: 'minHeight', label: 'hero band' },
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
  onMeasure: (id: string, m: Measurement | null) => void
  onSolo: (device: Device) => void
}) {
  const ref = useRef<HTMLIFrameElement>(null)

  const handleLoad = useCallback(() => {
    // A frame that has only just fired load may not have applied stylesheets
    // yet; one frame of delay is enough and avoids reading zeros.
    requestAnimationFrame(() => {
      if (ref.current) onMeasure(device.id, measure(ref.current))
    })
  }, [device.id, onMeasure])

  return (
    <div className="shrink-0">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-label font-semibold text-ktip-sand-900">{device.label}</span>
        <span className="text-micro text-ktip-sand-500">
          {device.width}x{device.height} css · {device.detail}
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

const DIAGONAL_KEY = 'ktip.responsive-preview.diagonal-in'

/**
 * The physical size of the screen you are sitting at, which no API reports.
 *
 * Everything else on this page is measured; this one number has to be typed,
 * because the browser exposes resolution and density but never inches. Without
 * it "This screen" can be compared in px but not in pt, and pt is the column
 * that settles whether someone else's laptop really shows smaller text.
 */
function useOwnDiagonal(): [number, (v: number) => void] {
  const [inches, setInches] = useState(() => {
    if (typeof window === 'undefined') return 27
    const stored = Number(window.localStorage.getItem(DIAGONAL_KEY))
    return stored > 0 ? stored : 27
  })
  const set = useCallback((v: number) => {
    setInches(v)
    if (v > 0) window.localStorage.setItem(DIAGONAL_KEY, String(v))
  }, [])
  return [inches, set]
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
                key={d.id}
                type="button"
                onClick={() => onPickDevice(d)}
                className={`rounded px-2 py-1 transition-colors ${
                  d.id === device.id
                    ? 'bg-white text-black font-semibold'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {d.label}
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
  // Laptops only by default: every frame is a full app boot, and laptops are
  // the block where the ramp steps crowd together and the bug reports come from.
  const [groups, setGroups] = useState<Group[]>(['laptop'])
  const [unit, setUnit] = useState<'px' | 'pt'>('px')
  const viewport = useViewport()
  const [ownDiagonal, setOwnDiagonal] = useOwnDiagonal()

  /**
   * The machine you are actually sitting at, offered as a device like any other.
   *
   * Panel and density come from the screen APIs; only the diagonal is typed. The
   * window may be smaller than the display, so width/height are overridden with
   * the live viewport while the density stays the panel's.
   */
  const thisScreen: Device = useMemo(() => {
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio
    const screenW = typeof window === 'undefined' ? 1440 : window.screen.width
    const screenH = typeof window === 'undefined' ? 900 : window.screen.height
    return {
      id: 'this-screen',
      label: 'This screen',
      detail: `${Math.round(screenW * dpr)}x${Math.round(screenH * dpr)} @ ${Math.round(dpr * 100)}%`,
      group: 'desktop',
      width: viewport.width,
      height: viewport.height,
      dpr,
      diagonalIn: ownDiagonal,
      // Density is a property of the panel, not of the window, so pt stays
      // right even when the browser is not maximised.
      panelW: Math.round(screenW * dpr),
      panelH: Math.round(screenH * dpr),
    }
  }, [viewport.width, viewport.height, ownDiagonal])

  const onMeasure = useCallback((id: string, m: Measurement | null) => {
    setMeasurements((prev) => ({ ...prev, [id]: m }))
  }, [])

  useEffect(() => {
    document.title = 'Responsive preview'
  }, [])

  const visible = useMemo(() => DEVICES.filter((d) => groups.includes(d.group)), [groups])
  const shown = visible.filter((d) => measurements[d.id])

  /**
   * Density of `thisScreen`, but corrected for the fact that its width is the
   * window rather than the panel — otherwise a half-width window would report
   * half the real density and every pt in its column would be wrong.
   */
  const ownPxPerIn = useMemo(() => {
    const panelAsDevice: Device = { ...thisScreen, width: Math.round(thisScreen.panelW / thisScreen.dpr) }
    return pxPerInch(panelAsDevice)
  }, [thisScreen])

  /** px → the unit currently selected, using the right density per column. */
  const fmt = useCallback(
    (px: number | undefined, d: Device) => {
      if (typeof px !== 'number' || Number.isNaN(px)) return '—'
      if (unit === 'px') return String(px)
      const ppi = d.id === 'this-screen' ? ownPxPerIn : pxPerInch(d)
      return toPt(px, ppi).toFixed(1)
    },
    [unit, ownPxPerIn],
  )

  /**
   * The readability floor, expressed in whichever unit is showing.
   *
   * 13px is the floor the migration exists to enforce, and at the notional 96
   * CSS px per inch that is 9.75pt — so a dense panel can satisfy the px rule
   * and still render text below the physical floor. Checking in the displayed
   * unit is what makes that visible.
   */
  const belowFloor = useCallback(
    (px: number | undefined, d: Device) => {
      if (typeof px !== 'number') return false
      if (unit === 'px') return px < 13
      const ppi = d.id === 'this-screen' ? ownPxPerIn : pxPerInch(d)
      return toPt(px, ppi) < 9.75
    },
    [unit, ownPxPerIn],
  )

  const toggleGroup = (g: Group) =>
    setGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))

  return (
    <div className="min-h-screen bg-ktip-canvas p-card-pad-lg">
      <header className="mb-6">
        <h1 className="text-title-lg font-display font-extrabold text-ktip-sand-900">
          Responsive preview
        </h1>
        <p className="mt-1 text-body text-ktip-sand-600">
          Every frame is the real app on that machine — CSS width derived from the panel and its OS
          scaling, height with the browser's own chrome already subtracted. Sizes below are measured
          out of the frames, not copied from the stylesheet.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-4">
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

        <label className="flex flex-col gap-1.5">
          <span className="text-label font-medium text-ktip-sand-700">My screen is</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={60}
              step={0.1}
              value={ownDiagonal}
              onChange={(e) => setOwnDiagonal(Number(e.target.value))}
              className="w-20 rounded-control border border-ktip-sand-200 bg-ktip-sand-50/50 px-3 py-3 text-body tabular-nums"
            />
            <span className="text-caption text-ktip-sand-600">
              inches — {Math.round(ownPxPerIn)} css px/in
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={() => setSolo(thisScreen)}
          className="btn-brand rounded-control px-6 py-3 text-body font-medium min-h-control-md"
        >
          Full screen — this screen ({viewport.width}×{viewport.height})
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-label font-medium text-ktip-sand-700">Show</span>
        {GROUPS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleGroup(key)}
            aria-pressed={groups.includes(key)}
            className={`rounded-control border px-3 py-1.5 text-label transition-colors ${
              groups.includes(key)
                ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                : 'border-ktip-sand-200 bg-ktip-cream text-ktip-sand-600 hover:bg-ktip-sand-50'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-2 text-caption text-ktip-sand-500">
          {visible.length} frame{visible.length === 1 ? '' : 's'} — each one boots the app
        </span>
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
        {visible.map((device) => (
          <DeviceFrame
            key={`${device.id}-${path}`}
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
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setTableOpen((open) => !open)}
              aria-expanded={tableOpen}
              className="flex items-center gap-2 text-title font-display font-bold text-ktip-sand-900"
            >
              <span
                aria-hidden
                className={`inline-block text-title-sm transition-transform ${tableOpen ? 'rotate-90' : ''}`}
              >
                ›
              </span>
              Measured sizes
              <span className="text-caption font-sans font-normal text-ktip-sand-500">
                {tableOpen ? 'hide' : `show — ${shown.length} machines`}
              </span>
            </button>

            {tableOpen && (
              <div className="flex items-center gap-1 rounded-control border border-ktip-sand-200 bg-ktip-cream p-1">
                {(['px', 'pt'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    aria-pressed={unit === u}
                    className={`rounded px-3 py-1 text-label transition-colors ${
                      unit === u
                        ? 'bg-ktip-ocean-500 font-semibold text-white'
                        : 'text-ktip-sand-600 hover:bg-ktip-sand-50'
                    }`}
                  >
                    {u === 'px' ? 'CSS px' : 'pt (physical)'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            hidden={!tableOpen}
            className="overflow-x-auto rounded-surface border border-ktip-sand-200 bg-ktip-cream"
          >
            <table className="w-full border-collapse text-label tabular-nums">
              <thead>
                <tr className="border-b border-ktip-sand-200 text-left align-bottom">
                  <th className="px-4 py-3 font-semibold text-ktip-sand-700">Token</th>
                  {shown.map((d) => (
                    <th key={d.id} className="px-3 py-3 text-right font-semibold text-ktip-sand-700">
                      <div>{d.label}</div>
                      <div className="text-micro font-normal text-ktip-sand-500">
                        {d.width}×{d.height} css
                      </div>
                      <div className="text-micro font-normal text-ktip-sand-400">
                        {Math.round(d.id === 'this-screen' ? ownPxPerIn : pxPerInch(d))} px/in
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-ktip-sand-200">
                  <td className="px-4 py-2 font-semibold text-ktip-sand-700">page overflow</td>
                  {shown.map((d) => {
                    const px = measurements[d.id]?.fit.pageOverflow ?? 0
                    return (
                      <td
                        key={d.id}
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
                    const fit = measurements[d.id]?.fit
                    const bad = (fit?.navOverflow ?? 0) > 0
                    return (
                      <td
                        key={d.id}
                        className={`px-3 py-2 text-right ${bad ? 'font-bold text-red-600' : 'text-ktip-tropical-700'}`}
                      >
                        {bad ? `+${fit!.navOverflow}` : 'ok'}
                      </td>
                    )
                  })}
                </tr>
                {/* Height is the constraint a width-only table hides: nav plus
                    hero band is what a reader gets INSTEAD of content on the
                    first screen, and on a 14" laptop it is most of it. */}
                <tr className="border-b border-ktip-sand-200">
                  <td className="px-4 py-2 font-semibold text-ktip-sand-700">nav + hero of fold</td>
                  {shown.map((d) => {
                    const m = measurements[d.id]
                    const above = (m?.fit.navHeight ?? 0) + (m?.box['hero band'] ?? 0)
                    const pct = Math.round((above / d.height) * 100)
                    return (
                      <td
                        key={d.id}
                        className={`px-3 py-2 text-right ${
                          pct >= 60 ? 'font-bold text-red-600' : pct >= 45 ? 'text-amber-600' : 'text-ktip-sand-800'
                        }`}
                      >
                        {m ? `${pct}%` : '—'}
                      </td>
                    )
                  })}
                </tr>
                {['--scale-display', '--scale-layout', '--scale-text'].map((ramp) => (
                  <tr key={ramp} className="border-b border-ktip-sand-100 bg-ktip-sand-50/40">
                    <td className="px-4 py-2 font-mono text-micro text-ktip-sand-600">{ramp}</td>
                    {shown.map((d) => (
                      <td key={d.id} className="px-3 py-2 text-right text-ktip-sand-800">
                        {measurements[d.id]?.scales[ramp]}
                      </td>
                    ))}
                  </tr>
                ))}
                {TYPE_TOKENS.map((token) => (
                  <tr key={token} className="border-b border-ktip-sand-100">
                    <td className="px-4 py-2 font-mono text-micro text-ktip-sand-600">{token}</td>
                    {shown.map((d) => {
                      const px = measurements[d.id]?.type[token]
                      return (
                        <td
                          key={d.id}
                          className={`px-3 py-2 text-right ${
                            belowFloor(px, d) ? 'font-bold text-red-600' : 'text-ktip-sand-800'
                          }`}
                        >
                          {fmt(px, d)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {BOX_TOKENS.map(({ label }) => (
                  <tr key={label} className="border-b border-ktip-sand-100 bg-ktip-sand-50/40">
                    <td className="px-4 py-2 font-mono text-micro text-ktip-sand-600">{label}</td>
                    {shown.map((d) => (
                      <td key={d.id} className="px-3 py-2 text-right text-ktip-sand-800">
                        {measurements[d.id]?.box[label]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tableOpen && (
            <p className="mt-2 text-caption text-ktip-sand-500">
              Red marks anything under the readability floor — 13px, or 9.75pt in the physical view.
              Type rows follow the unit toggle; box rows stay in CSS px because layout is authored in
              them. Two columns showing the same pt look the same size to a reader; the same px on
              two different densities do not. Stock <code>p-6</code> and <code>gap-4</code> are
              included to show the global <code>--spacing</code> override reaching utilities nothing
              migrated.
            </p>
          )}
        </section>
      )}

      {solo && (
        <SoloView
          device={solo.id === 'this-screen' ? thisScreen : solo}
          devices={[thisScreen, ...visible]}
          path={path}
          viewport={viewport}
          onPickDevice={setSolo}
          onClose={() => setSolo(null)}
        />
      )}
    </div>
  )
}
