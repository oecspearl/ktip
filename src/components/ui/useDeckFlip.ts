import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Deck-style flip: one card, cumulative rotation.
 *
 * Each step adds 180deg, so the card keeps spinning the same way while
 * travelling to the opposite side of the stage. The face content swaps exactly
 * when rotation crosses 90/270/… (card edge-on, swap invisible). Odd faces land
 * at 180deg — mirrored — so the face content is counter-flipped with
 * `scaleX(-1)`; `face % 2 === 1` is the caller's cue to do that.
 *
 * Lifted out of AuthSplitShell so the welcome panel can use the same motion.
 * The two differ only in how wide the card is, which is why `panelPct` is a
 * parameter rather than the 45 it was hard-coded to.
 */

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

const faceFor = (rot: number, n: number) =>
  Math.max(0, Math.min(Math.floor((rot + 90) / 180), n - 1))

/**
 * Continuous horizontal position: within each half-turn the card slides from
 * its current side to the opposite one, so x and rotation stay in lockstep.
 *
 * The card is `panelPct` of the stage; travelling the remaining stage equals
 * (100 - panelPct)/panelPct of the card's own width, which translateX(%) is
 * relative to.
 */
const xFor = (rot: number, maxRot: number, panelPct: number) => {
  const xMax = ((100 - panelPct) / panelPct) * 100
  const r = Math.max(0, Math.min(rot, maxRot))
  const seg = Math.min(Math.floor(r / 180), Math.ceil(maxRot / 180) - 1)
  const t = (r - seg * 180) / 180
  const from = seg % 2 === 0 ? 0 : xMax
  const to = (seg + 1) % 2 === 0 ? 0 : xMax
  return from + (to - from) * t
}

const applyTransform = (el: HTMLElement, rot: number, maxRot: number, panelPct: number) => {
  el.style.transform = `translateX(${xFor(rot, maxRot, panelPct)}%) rotateY(${rot}deg)`
}

export function useDeckFlip(step: number, n: number, panelPct = 45) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [face, setFace] = useState(step - 1)
  const state = useRef({ rot: (step - 1) * 180, raf: 0 })
  const maxRot = (n - 1) * 180

  // Paint the initial position before first frame
  useLayoutEffect(() => {
    if (panelRef.current) applyTransform(panelRef.current, state.current.rot, maxRot, panelPct)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = panelRef.current
    const s = state.current
    const target = (step - 1) * 180
    if (!el || s.rot === target) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !el.offsetParent) {
      // Instant swap: reduced motion, or panel hidden (mobile)
      s.rot = target
      applyTransform(el, target, maxRot, panelPct)
      setFace(faceFor(target, n))
      return
    }

    cancelAnimationFrame(s.raf)
    const from = s.rot
    const halfTurns = Math.abs(target - from) / 180
    const dur = 450 + 200 * halfTurns
    const t0 = performance.now()

    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1)
      const rot = from + (target - from) * easeInOut(p)
      s.rot = rot
      applyTransform(el, rot, maxRot, panelPct)
      setFace(faceFor(rot, n))
      if (p < 1) s.raf = requestAnimationFrame(tick)
    }
    s.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(s.raf)
  }, [step, n, maxRot, panelPct])

  return { panelRef, face }
}
