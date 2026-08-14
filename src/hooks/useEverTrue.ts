import { useRef } from 'react'

/**
 * Latches to true the first time its argument is true, and stays there.
 *
 * For gating a `React.lazy` overlay on whether it has ever been opened.
 * Rendering such a component unconditionally — which is the natural thing to
 * do when it already returns `null` while closed — still resolves its chunk on
 * every page load, because `lazy()` fires the import the moment the element is
 * rendered, `null` return value or not. MainLayout was paying that three times
 * over (messaging, member drawer, sticky notes) on every route, for panels
 * most readers never open.
 *
 * Gating on the live `isOpen` instead would unmount each panel the instant it
 * closed, cutting its exit animation and discarding its internal state. The
 * latch keeps the mount permanent once earned, so behaviour after the first
 * open is identical to rendering it unconditionally.
 *
 * A ref rather than state: flipping it must not itself schedule a render. The
 * render that turns the condition true is already happening, and it is the one
 * that needs the new value.
 */
export function useEverTrue(condition: boolean): boolean {
  const seen = useRef(false)
  if (condition) seen.current = true
  return seen.current
}
