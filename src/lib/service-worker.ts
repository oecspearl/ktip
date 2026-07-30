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
    // Never reload out from under an OAuth handoff. A PKCE code is single-use
    // and its verifier is deleted the moment the exchange runs, so a reload
    // landing mid-exchange replays a spent code against a missing verifier and
    // the sign-in fails permanently — the user is bounced to /login with no way
    // to retry except clearing storage. autoUpdate claims on a fresh
    // navigation, and returning from Google is exactly that, so this is the
    // likeliest moment for the race rather than the rarest.
    //
    // Skipping the reload here is safe now that navigateFallbackDenylist sends
    // every /auth/ navigation to the network: the callback page is already
    // guaranteed to be the current build, which is the only thing the reload
    // was protecting.
    if (isOAuthHandoff()) return
    reloading = true
    window.location.reload()
  })
}

/** True when this document is part of an in-flight OAuth sign-in. */
function isOAuthHandoff(): boolean {
  return (
    window.location.pathname.startsWith('/auth/') ||
    window.location.search.includes('code=') ||
    window.location.hash.includes('access_token=')
  )
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
