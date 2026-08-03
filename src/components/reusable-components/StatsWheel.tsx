import { useCallback, useEffect, useRef, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import { resolveCopy, type Copy } from '../../i18n/copy'

export interface StatsWheelItem {
  value: string
  /**
   * `Copy`, not `string`: DiscoverPage feeds this from harvested source
   * strings and `msg` descriptors both. Resolved here, same pattern as
   * SortSelect, so callers never have to cast.
   */
  label: Copy
}

interface StatsWheelProps {
  items: StatsWheelItem[]
  /** ms between auto-advances */
  interval?: number
  className?: string
}

// Wheel geometry — options sit on a circle whose radius keeps the arc length
// between two neighbors equal to one row height (same construction as the
// reactbits OptionWheel this is adapted from, mirrored for the right side).
const ROW_H = 112
const TILT = (6 * Math.PI) / 180 // radians between adjacent items
const CURVE = 1
const BLUR = 2
const FADE = 0.25
const MIN_OPACITY = 0.05
const TAU = 0.22 // easing time constant, seconds

/**
 * Auto-rotating vertical option wheel for a short list of stats. Items curl
 * along a circle anchored to the right edge; the centered item is fully
 * opaque, neighbors fade and blur with distance. Cycles on a timer, pauses on
 * hover, and clicking an item rotates it into the center.
 */
export function StatsWheel({ items, interval = 3000, className = '' }: StatsWheelProps) {
  const { i18n } = useLingui()
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const posRef = useRef(0)
  const targetRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef(0)
  const [selected, setSelected] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = items.length

  const runFrame = useCallback(
    (now: number) => {
      const dt = Math.min((now - lastRef.current) / 1000, 0.05)
      lastRef.current = now
      const k = 1 - Math.exp(-dt / TAU)

      let next = posRef.current + (targetRef.current - posRef.current) * k
      const settled = Math.abs(targetRef.current - next) < 0.001
      if (settled) next = targetRef.current
      posRef.current = next

      const R = ROW_H / TILT
      for (let i = 0; i < count; i++) {
        const el = itemRefs.current[i]
        if (!el) continue
        // Distance to the nearest looped copy of item i
        let d = i - next
        d = ((d % count) + count) % count
        if (d > count / 2) d -= count
        const dist = Math.abs(d)
        const ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d * TILT))
        const y = R * Math.sin(ang)
        const x = R * (1 - Math.cos(ang)) * CURVE
        const rot = (-ang * 180) / Math.PI
        el.style.transform = `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${rot.toFixed(3)}deg)`
        el.style.opacity = String(Math.max(MIN_OPACITY, 1 - dist * FADE))
        el.style.filter = dist > 0.01 ? `blur(${(dist * BLUR).toFixed(2)}px)` : 'none'
      }

      rafRef.current = settled ? null : requestAnimationFrame(runFrame)
    },
    [count],
  )

  const startLoop = useCallback(() => {
    if (rafRef.current != null) return
    lastRef.current = performance.now()
    rafRef.current = requestAnimationFrame(runFrame)
  }, [runFrame])

  const applyTarget = useCallback(
    (value: number) => {
      targetRef.current = value
      setSelected(((Math.round(value) % count) + count) % count)
      startLoop()
    },
    [count, startLoop],
  )

  // Auto-advance, held while hovered
  useEffect(() => {
    if (paused || count < 2) return
    const t = setInterval(() => applyTarget(targetRef.current + 1), interval)
    return () => clearInterval(t)
  }, [paused, count, interval, applyTarget])

  // Initial layout + relayout when the items (e.g. loaded stats) change.
  // The cleanup must reset rafRef to null — under StrictMode the effect runs
  // mount → cleanup → mount, and a stale non-null ref makes startLoop think a
  // frame is still scheduled, leaving the wheel permanently unlaid-out.
  useEffect(() => {
    startLoop()
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [items, startLoop])

  const handleClick = (i: number) => {
    // Rotate by the shortest looped path to the clicked item
    const cur = targetRef.current
    let d = i - (((Math.round(cur) % count) + count) % count)
    if (d > count / 2) d -= count
    else if (d < -count / 2) d += count
    applyTarget(Math.round(cur) + d)
  }

  return (
    <div
      role="listbox"
      aria-label={i18n._(msg`Platform statistics`)}
      className={`relative overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_22%,black_78%,transparent)] ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {items.map((item, i) => (
        <div
          // Index, deliberately: the list is a fixed carousel that never
          // reorders, labels are now descriptors (not valid keys), and values
          // collide — every stat renders "—" while counts load.
          key={i}
          ref={(el) => {
            itemRefs.current[i] = el
          }}
          role="option"
          aria-selected={selected === i}
          onClick={() => handleClick(i)}
          className="absolute right-0 top-1/2 origin-right whitespace-nowrap text-right cursor-pointer will-change-transform"
        >
          <span className="text-6xl md:text-7xl font-display font-extrabold tabular-nums">
            {item.value}
          </span>
          <span className="ml-4 text-base uppercase tracking-[0.2em] opacity-60">{resolveCopy(i18n, item.label)}</span>
        </div>
      ))}
    </div>
  )
}
