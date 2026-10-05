import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../../../hooks/useReducedMotion'

/**
 * A number that counts up to `target` once, ease-out-cubic, after `delayMs`.
 *
 * Later changes (a stats query landing after the first paint) count from the
 * last shown value rather than from zero, so a figure never jumps backwards.
 * Reduced motion — the OS setting or the in-app switch — shows the target
 * immediately.
 */
export function useCountUp(target: number | null | undefined, delayMs = 700, durationMs = 1700) {
  const reduced = useReducedMotion()
  const [value, setValue] = useState<number | null>(target == null ? null : reduced ? target : 0)
  const shown = useRef<number>(0)

  useEffect(() => {
    if (target == null) {
      setValue(null)
      return
    }
    if (reduced) {
      shown.current = target
      setValue(target)
      return
    }
    const from = shown.current
    if (from === target) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now() + (from === 0 ? delayMs : 0)
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs))
      const next = from + (target - from) * (1 - Math.pow(1 - t, 3))
      shown.current = next
      setValue(next)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced, delayMs, durationMs])

  return value
}
