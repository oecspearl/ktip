import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { isUuid, type Sluggable } from '../lib/slug'

/**
 * Rewrites a uuid address bar to the row's slug once the row has loaded.
 *
 * Old links keep working — `/grants/<uuid>` resolves natively, because the
 * detail hooks accept either shape — but landing on one and leaving it there
 * would mean the ugly URL is what gets copied and shared onward. The rewrite is
 * `replace`, so Back still goes where the visitor came from rather than
 * bouncing between the two spellings of the same page.
 *
 * Only the first path segment pair is swapped, so sub-paths (/grants/<id>/apply)
 * are left alone by simply not calling this from those pages.
 */
export function useCanonicalSlug(param: string | undefined, row: Sluggable | null | undefined) {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!param || !row?.slug) return
    if (!isUuid(param)) return

    navigate(
      {
        pathname: location.pathname.replace(param, row.slug),
        search: location.search,
        hash: location.hash,
      },
      { replace: true }
    )
    // location.pathname is the only part of `location` that participates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, row?.slug, location.pathname])
}
