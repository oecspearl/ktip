import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { NavigationAdapter } from '@a11y-kit'

/**
 * The router as the a11y kit sees it. A11yHost sits outside RouterProvider
 * (it has to cover the auth pages and the floating panels), so the router
 * reaches it through this bridge, mounted once at the router's root.
 * Until the bridge mounts, navigation falls back to a full page load.
 */
let navigateFn: ((path: string) => void) | null = null
let current = typeof window !== 'undefined' ? window.location.pathname + window.location.hash : '/'
const listeners = new Set<() => void>()

export const ktipNavigation: NavigationAdapter = {
  navigate(path) {
    if (navigateFn) navigateFn(path)
    else window.location.assign(path)
  },
  location: {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  },
}

/** Renders nothing. Mount inside the router, at its root route. */
export function A11yRouterBridge() {
  const navigate = useNavigate()
  const { pathname, hash } = useLocation()

  useEffect(() => {
    navigateFn = (path) => navigate(path)
    return () => {
      navigateFn = null
    }
  }, [navigate])

  useEffect(() => {
    current = pathname + hash
    listeners.forEach((l) => l())
  }, [pathname, hash])

  return null
}
