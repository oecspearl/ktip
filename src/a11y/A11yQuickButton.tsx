import { useEffect, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import { Accessibility } from 'lucide-react'
import { useFabPresent } from './fab-presence'

/** How long the FAB has to be missing before this stands in for it. */
const SETTLE_MS = 800

/**
 * The Accessibility button on pages without the FAB: sign-in, sign-up,
 * onboarding, the MFA screens. Someone who needs larger text to read the
 * sign-up form should not have to finish signing up to get it. The hosted
 * service opens its pop-up from any element marked data-viridion-a11y="open".
 */
export function A11yQuickButton() {
  const { t } = useLingui()
  const fab = useFabPresent()
  const [settled, setSettled] = useState(false)

  // MainLayout mounts its FAB a moment after the router first renders. Waiting
  // for it to stay absent keeps this from flashing up on every main page load
  useEffect(() => {
    if (fab) {
      setSettled(false)
      return
    }
    const timer = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [fab])

  if (fab || !settled) return null

  return (
    <button
      type="button"
      data-viridion-a11y="open"
      aria-label={t`Accessibility`}
      className="fixed bottom-4 right-4 z-fab flex size-12 items-center justify-center rounded-full bg-ktip-ocean-700 text-white shadow-fab hover:shadow-fab-hover dark:bg-ktip-tropical-500 dark:text-brand-navy"
    >
      <Accessibility aria-hidden="true" className="size-icon-lg" />
    </button>
  )
}
