import { loadKtipCatalog, KtipCatalogUnavailableError } from '../_lib/ktip-catalog'

export const config = { runtime: 'edge' }

/**
 * Public passthrough for the Virtual Campus KTIP course catalog, backing the
 * "Courses" tab on /resources?tab=courses.
 *
 * Proxied server-side rather than called directly from the browser: it keeps
 * the SPA from having to deal with cross-origin requests to oecscampus.org.
 * Deliberately uncached end-to-end (see loadKtipCatalog()) — an admin
 * removing a course from the campus should stop showing it on the very next
 * request, not lag behind a browser or CDN cache.
 */
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const { items, total } = await loadKtipCatalog()
    return json({ items, total }, 200)
  } catch (err) {
    if (err instanceof KtipCatalogUnavailableError) {
      return json({ error: 'Course catalog is temporarily unavailable' }, 503)
    }
    return json({ error: 'Could not load the course catalog' }, 500)
  }
}
