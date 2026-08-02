import { useEffect, useRef, useState } from 'react'

/**
 * Ease a number towards a target on animation frames.
 *
 * Used for the two things the map animates structurally — the tilt between
 * plan and isometric, and how far the floors are pulled apart. Both need to be
 * readable *during* the transition (the projection is recomputed from them
 * every frame), which rules out a CSS transition.
 *
 * Respects prefers-reduced-motion by snapping: someone who asked not to be
 * moved should get the same map, immediately.
 */
export function useAnimatedValue(target: number, speed = 7): number {
  const [value, setValue] = useState(target)
  const valueRef = useRef(target)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (reduced) {
      valueRef.current = target
      setValue(target)
      return
    }

    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const diff = target - valueRef.current
      if (Math.abs(diff) < 0.004) {
        if (valueRef.current !== target) {
          valueRef.current = target
          setValue(target)
        }
        return
      }
      valueRef.current += diff * Math.min(1, dt * speed)
      setValue(valueRef.current)
      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, speed])

  return value
}

/** Element size, kept in step with a ResizeObserver. */
export function useElementSize<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [size, setSize] = useState({ width: 960, height: 560 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return size
}
