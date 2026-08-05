import { useEffect } from 'react'

/** How long the settle animation runs; has to match `rotateSettle` in index.css */
const SETTLE_MS = 420

/**
 * Softens a device rotation.
 *
 * Layout cannot be tweened across an orientation change — the viewport swaps
 * its dimensions in one frame and every breakpoint, grid and scale token
 * resolves against the new box immediately. What can be softened is the swap
 * itself: the flag set here puts a short fade on the app while the new layout
 * lands, so the page arrives rather than snapping.
 *
 * Both listeners are needed. `screen.orientation` is the accurate one but is
 * absent on older iOS; the orientation media query fires there. Whichever
 * arrives first wins, and the timer is restarted rather than stacked so a
 * half-rotation that settles back does not leave the flag on.
 */
export function useOrientationTransition() {
  useEffect(() => {
    const root = document.documentElement
    let timer = 0

    const mark = () => {
      root.setAttribute('data-rotating', '')
      window.clearTimeout(timer)
      // Restarting the animation needs the attribute to actually toggle, so it
      // comes off on the next frame's end rather than being left to expire.
      timer = window.setTimeout(() => root.removeAttribute('data-rotating'), SETTLE_MS)
    }

    const orientation = window.screen?.orientation
    orientation?.addEventListener('change', mark)
    const query = window.matchMedia('(orientation: portrait)')
    query.addEventListener('change', mark)

    return () => {
      window.clearTimeout(timer)
      root.removeAttribute('data-rotating')
      orientation?.removeEventListener('change', mark)
      query.removeEventListener('change', mark)
    }
  }, [])
}
