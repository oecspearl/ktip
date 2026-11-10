/**
 * One automatic reload per failed route load, never a loop.
 *
 * A route's chunk fails to download almost always because a deploy replaced
 * it: this tab, or the service worker's precached index.html, still names the
 * previous build's hashed files. A full reload fetches the current build and
 * fixes it. But a reload can land on the same stale shell (the old service
 * worker answers until the new one has installed), fail again, and reload
 * again, forever. So the first failure claims the reload and any further
 * failure inside the window shows a screen with a Reload button instead.
 *
 * The window is long enough to cover a reload that lands on the stale shell
 * and short enough that the next deploy, hours later, gets its own reload.
 */
const KEY = 'ktip:route-reload-at'
export const AUTO_RELOAD_WINDOW_MS = 30_000

type ReloadStore = Pick<Storage, 'getItem' | 'setItem'>

function sessionStore(): ReloadStore | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * True when this failure may reload the page by itself; records the claim.
 * False when one already ran inside the window, or when there is nowhere to
 * record it: without storage there is no way to tell a first failure from a
 * loop, so the screen is the safe answer.
 */
export function claimAutoReload(now: number = Date.now(), store: ReloadStore | null = sessionStore()): boolean {
  if (!store) return false
  try {
    const last = Number(store.getItem(KEY))
    if (last && now - last >= 0 && now - last < AUTO_RELOAD_WINDOW_MS) return false
    store.setItem(KEY, String(now))
    return true
  } catch {
    return false
  }
}
