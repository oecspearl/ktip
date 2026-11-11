/**
 * What to do when a route's code fails to download, without ever looping.
 *
 * A route's chunk fails to download almost always because a deploy replaced
 * it: this tab still names the previous build's hashed files, which Vercel
 * stops serving the moment the new deployment is promoted. A full reload
 * fetches the current build and fixes it, because page loads go to the network
 * rather than the service worker's cache (see the navigation rule in
 * vite.config.ts).
 *
 * The steps, each claimed at most once inside its window:
 *  1. reload — the normal fix, looks like the usual loading state.
 *  2. reset-worker — the reload failed too, on a page a service worker
 *     controls. The worker may be serving a stale shell, so it is removed and
 *     the page loaded again from the network.
 *  3. show-screen — both failed, or the device is offline. The screen offers a
 *     Reload button and reloads by itself when the connection comes back.
 *
 * The windows are long enough to cover a reload that fails again and short
 * enough that the next deploy, hours later, gets its own recovery.
 */
const RELOAD_KEY = 'ktip:route-reload-at'
export const AUTO_RELOAD_WINDOW_MS = 30_000

const WORKER_RESET_KEY = 'ktip:route-worker-reset-at'
export const WORKER_RESET_WINDOW_MS = 5 * 60_000

type ReloadStore = Pick<Storage, 'getItem' | 'setItem'>

function sessionStore(): ReloadStore | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * True when no claim under `key` was made inside the window; records this one.
 * False when one was, or when there is nowhere to record it: without storage
 * there is no way to tell a first failure from a loop, so the screen is the
 * safe answer.
 */
function claimOnce(key: string, windowMs: number, now: number, store: ReloadStore | null): boolean {
  if (!store) return false
  try {
    const last = Number(store.getItem(key))
    if (last && now - last >= 0 && now - last < windowMs) return false
    store.setItem(key, String(now))
    return true
  } catch {
    return false
  }
}

/** True when this failure may reload the page by itself; records the claim. */
export function claimAutoReload(now: number = Date.now(), store: ReloadStore | null = sessionStore()): boolean {
  return claimOnce(RELOAD_KEY, AUTO_RELOAD_WINDOW_MS, now, store)
}

/**
 * True when this failure may remove the service worker and reload; records the
 * claim. Its window is longer than the reload's so the two cannot alternate
 * into a loop on a page that keeps failing for some other reason.
 */
export function claimWorkerReset(now: number = Date.now(), store: ReloadStore | null = sessionStore()): boolean {
  return claimOnce(WORKER_RESET_KEY, WORKER_RESET_WINDOW_MS, now, store)
}

export type RouteLoadRecovery = 'reload' | 'reset-worker' | 'show-screen'

export interface RecoveryContext {
  /** False only when the browser is sure there is no connection. */
  online: boolean
  /** Whether a service worker controls this page. */
  controlled: boolean
  now?: number
  store?: ReloadStore | null
}

/**
 * The next step after a route's code failed to load.
 *
 * Offline goes straight to the screen without spending a claim: a reload
 * cannot download anything either, and the screen reloads by itself once the
 * connection is back.
 */
export function chooseRouteLoadRecovery({
  online,
  controlled,
  now = Date.now(),
  store = sessionStore(),
}: RecoveryContext): RouteLoadRecovery {
  if (!online) return 'show-screen'
  if (claimAutoReload(now, store)) return 'reload'
  if (controlled && claimWorkerReset(now, store)) return 'reset-worker'
  return 'show-screen'
}
