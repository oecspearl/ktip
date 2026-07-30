import { useEffect, useRef, useState } from 'react'

export type DisclosureState = 'open' | 'closed'

export const DISCLOSURE_ENTER_MS = 200
export const DISCLOSURE_EXIT_MS = 150

interface UseDisclosureAnimationOptions {
  /** Enter length in ms. Must match the CSS in index.css. */
  enterMs?: number
  /** Exit length in ms. Must match the CSS in index.css. */
  exitMs?: number
  /** Keep children mounted while closed — the height-collapse case. */
  keepMounted?: boolean
}

interface DisclosureAnimation {
  /** Render while true; stays true for the whole exit transition. */
  mounted: boolean
  /** Feed to `data-state` so CSS can drive the transition. */
  state: DisclosureState
  /** False while a transition is in flight — releases `overflow-hidden`. */
  settled: boolean
}

/**
 * Open/close animation state for something that is conditionally rendered.
 *
 * The panel mounts in its closed state, paints, and only then flips to open,
 * which is what makes the enter transition actually run. On close it stays
 * mounted for `exitMs` so the exit can play — a `@keyframes` cannot do this,
 * since it has nothing to animate once React has removed the node.
 *
 * Under `prefers-reduced-motion` both ends are instant.
 */
export function useDisclosureAnimation(
  open: boolean,
  {
    enterMs = DISCLOSURE_ENTER_MS,
    exitMs = DISCLOSURE_EXIT_MS,
    keepMounted = false,
  }: UseDisclosureAnimationOptions = {}
): DisclosureAnimation {
  const [mounted, setMounted] = useState(open || keepMounted)
  const [state, setState] = useState<DisclosureState>(open ? 'open' : 'closed')
  const [settled, setSettled] = useState(true)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frame = useRef(0)
  const first = useRef(true)

  useEffect(() => {
    // Cancel whatever the previous run scheduled. Exactly one timer and one
    // frame are ever pending, so rapid open/close/open cannot pile up.
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    cancelAnimationFrame(frame.current)

    // No entrance for something rendered open on first paint
    if (first.current) {
      first.current = false
      return
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (open) {
      setMounted(true)
      if (reduced) {
        setState('open')
        setSettled(true)
        return
      }
      setSettled(false)
      // Two frames: one to mount at data-state="closed", one to flip it
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => {
          setState('open')
          timer.current = setTimeout(() => {
            setSettled(true)
            timer.current = null
          }, enterMs)
        })
      })
      return
    }

    setState('closed')
    if (reduced) {
      setSettled(true)
      if (!keepMounted) setMounted(false)
      return
    }
    setSettled(false)
    timer.current = setTimeout(() => {
      setSettled(true)
      if (!keepMounted) setMounted(false)
      timer.current = null
    }, exitMs)
  }, [open, enterMs, exitMs, keepMounted])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      cancelAnimationFrame(frame.current)
    },
    []
  )

  return { mounted, state, settled }
}
