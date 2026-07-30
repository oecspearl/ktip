/**
 * Service-worker takeover handling.
 *
 * `registerType: 'autoUpdate'` builds a worker that calls skipWaiting() and
 * clientsClaim(), so a new worker installs and seizes control of pages that are
 * already open. What it does NOT do is reload those pages, which leaves the tab
 * running the previous build's JavaScript against the new worker's precache.
 * Two things go wrong in that state:
 *
 *  1. cleanupOutdatedCaches() has already dropped the old asset revisions, so
 *     any route the user has not visited yet fails its lazy import.
 *  2. A routing bug shipped in an old worker keeps deciding what the tab sees
 *     until the tab is reloaded. That is what stranded OAuth sign-in: a stale
 *     worker precached `auth/callback.html` (a dead file from the pre-React
 *     app), Workbox's precache route resolves `/auth/callback` to it via its
 *     default `cleanURLs` behaviour, and that file redirects to `/` — which
 *     discards the `#access_token=…` fragment before detectSessionInUrl can
 *     read it, so the user lands back on the home page signed out.
 *
 * Reloading the moment a new worker takes over fixes both without anyone
 * having to unregister a worker by hand in DevTools.
 */
export function watchForServiceWorkerTakeover() {
  if (!('serviceWorker' in navigator)) return

  // A null controller means no worker is driving this page yet — the very first
  // install. Claiming an uncontrolled page changes nothing about what it was
  // served, so reloading there would be a pointless flash on a first visit.
  if (!navigator.serviceWorker.controller) return

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}
