import { useEffect, useState } from 'react'

/**
 * Whether to keep the hero's placeholder up a moment longer.
 *
 * The stats and connection count are asked for only once the profile view has
 * said which sections are open, so they land a round trip after it. Mounting
 * the hero before then means the figures, the standing card and the mini bar
 * pop in mid-entrance and shove everything sideways. Holding until they settle
 * lets the entrance play once, into the final layout.
 *
 * Capped at `capMs` per member: a slow or retrying query costs its figures,
 * never the page.
 */
export function useHeroHold(pending: boolean, key: string | undefined, capMs = 1500) {
  const [expiredFor, setExpiredFor] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => setExpiredFor(key), capMs)
    return () => clearTimeout(timer)
  }, [pending, key, capMs])

  return pending && expiredFor !== key
}
