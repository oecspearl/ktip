/**
 * Service-worker housekeeping.
 *
 * There used to be a reload here on every `controllerchange`. It existed
 * because the worker answered page loads from its precache, so a tab could be
 * running a build older than the worker that had just taken over. Page loads
 * now always go to the network (the navigation rule in vite.config.ts), so a
 * freshly opened page is already the live build and that reload only flashed
 * it a few seconds in, after every deploy. A tab left open across a deploy is
 * handled where it actually breaks: lazyPage in App.tsx, on the first chunk
 * that fails to load.
 */

/**
 * Whether a service worker is driving this page. A route that keeps failing
 * on such a page may be getting a stale shell from it; on an uncontrolled page
 * there is no worker to reset.
 */
export function isControlledByServiceWorker(): boolean {
  try {
    return 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null
  } catch {
    return false
  }
}

/**
 * Last resort when a route still fails after a plain reload: remove this
 * site's service worker and load the page again straight from the network.
 *
 * A plain reload normally fetches the live build, since page loads skip the
 * worker's cache. This covers whatever that misses: a worker installed by an
 * older build that still answers page loads from its precache, or one stuck
 * mid-update. unregister() takes the worker off the site's scope at once, so
 * the reload that follows is not routed through it, and registerSW.js installs
 * a current one on that load. Nothing is lost but the offline shell, for the
 * seconds until the new worker has precached it again.
 */
export async function resetServiceWorkerAndReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    /* No access to the registrations: a plain reload is still the best next step */
  }
  window.location.reload()
}

/**
 * Cache written by a runtimeCaching entry this app no longer ships.
 *
 * That entry matched every *.supabase.co URL, so it holds `/auth/v1/user` and
 * `/rest/v1/*` responses keyed by URL alone — no Authorization in the key, no
 * Vary on the response — which lets one account be served another's rows.
 * Removing the entry stops new writes but does nothing about the cache already
 * sitting in browsers that ran an older build, and Workbox's
 * cleanupOutdatedCaches only touches precaches. So it is deleted outright: once
 * at startup, and again whenever the signed-in account changes.
 */
const LEGACY_SUPABASE_RESPONSE_CACHE = 'supabase-api'

export async function purgeSupabaseResponseCache() {
  if (typeof caches === 'undefined') return
  try {
    await caches.delete(LEGACY_SUPABASE_RESPONSE_CACHE)
  } catch {
    /* Cache Storage is unavailable (private mode, blocked storage) — nothing to purge */
  }
}
