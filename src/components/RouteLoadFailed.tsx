import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { RefreshCw, Home } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { Button } from './ui/Button'
import { RouteSplash } from './RouteSplash'

/**
 * What a route renders when its code could not be downloaded.
 *
 * This used to say "This page is being migrated" with a client-side <Link> to
 * Discover. On Discover that link pointed at itself; anywhere else it led to a
 * route whose chunk failed the same way. React Router keeps a resolved `lazy`
 * for the life of the page, so the reader was stuck until they found a reload
 * button, and an installed app has none. Every way off this screen is a full
 * page load for that reason.
 */
export function RouteLoadFailed() {
  const { t } = useLingui()
  const { pathname } = useLocation()

  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 gap-4 text-center">
      <h1 className="text-2xl font-display font-bold text-ktip-sand-900">{t`This page didn't load`}</h1>
      <p className="max-w-md text-ktip-sand-600">
        {t`KTIP was probably updated since you opened it, or your connection dropped. Reloading gets you the latest version.`}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button onClick={() => window.location.reload()} icon={<RefreshCw size={18} />}>
          {t`Reload`}
        </Button>
        {/* Hidden on Discover itself, where it would only reload the same page. */}
        {pathname !== '/' && (
          <Button variant="outline" onClick={() => window.location.assign('/')} icon={<Home size={18} />}>
            {t`Go to Discover`}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * The first failure's answer: reload by itself, looking like the normal
 * loading state. It reloads on mount rather than from the route's `lazy`,
 * because `lazy` runs before the navigation commits, while the address bar
 * still shows the page being left.
 */
export function ReloadOnMount() {
  useEffect(() => {
    window.location.reload()
  }, [])
  return <RouteSplash />
}
