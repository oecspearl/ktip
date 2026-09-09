import { lazy, type ComponentType } from 'react'
import { AppError } from './app-error'
import { captureException } from './monitoring'

/**
 * A lazily-loaded overlay that cannot take the page down with it.
 *
 * `React.lazy` caches the result of its factory, including a rejection: once
 * the import fails the component throws that same error on every subsequent
 * render, for the life of the page. The panels in MainLayout are mounted under
 * the app-wide AppErrorBoundary, so a single failed chunk fetch did not degrade
 * the sticky-note layer — it replaced the whole site with "Something went
 * wrong", and stayed there until the reader reloaded by hand.
 *
 * That fetch fails for ordinary reasons. In dev, Vite re-optimises dependencies
 * and briefly refuses module requests while it does; in production a deploy
 * invalidates the hashed chunk a long-lived tab is still holding a reference
 * to. Both are transient and neither is the reader's problem.
 *
 * So: retry, then degrade. Two more attempts with a widening gap cover the
 * re-optimisation window, and a chunk that still will not load resolves to a
 * component that renders nothing. The report is what makes that honest —
 * `lazyPage` in App.tsx already made exactly this trade for route bundles, and
 * this is the same failure under the same code.
 *
 * The cost of degrading is real and worth naming: a reader who has notes open
 * loses the layer that draws them until they reload. Their notes are not lost
 * — they are rows, not component state — but they are invisible, which is why
 * this reports rather than swallowing.
 */
/** Milliseconds to wait before each retry. Two, so three attempts in all. */
const RETRY_DELAYS = [300, 600]

/**
 * The retry-then-degrade policy, separately from React.
 *
 * Exported for the test: `lazy()` swallows its factory into an opaque payload
 * that can only be observed by rendering under Suspense, and the behaviour
 * worth pinning down here — that this NEVER rejects — is a property of the
 * loader, not of the render.
 */
export async function loadOrNothing<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
  area: string,
  delays: readonly number[] = RETRY_DELAYS
): Promise<{ default: T }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load()
    } catch (error) {
      if (attempt >= delays.length) {
        // Same code as a failed route bundle: it is the same event — a chunk
        // this build expects to exist did not arrive — and grouping them
        // together is what makes a bad deploy legible in one issue.
        console.error(`[${area}] overlay chunk failed to load`, error)
        captureException(
          new AppError({
            code: 'ROUTE_IMPORT_FAILED',
            area,
            operation: 'lazy-overlay',
            cause: error,
          })
        )
        return { default: (() => null) as unknown as T }
      }
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
    }
  }
}

export function lazyOverlay<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
  area: string
) {
  // The type parameter is read off the loader rather than off the props: these
  // panels take none, and a `P extends object` signature infers `never` for
  // them and then refuses the call at every site.
  return lazy<T>(() => loadOrNothing(load, area))
}
