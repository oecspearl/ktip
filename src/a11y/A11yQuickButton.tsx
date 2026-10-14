import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Accessibility } from 'lucide-react'
import { onRequest, useA11yMessages } from '@a11y-kit'
import { useFabPresent } from './fab-presence'

const AccessibilityPanel = lazy(() => import('./ui').then((m) => ({ default: m.AccessibilityPanel })))

/** How long the FAB has to be missing before this stands in for it. */
const SETTLE_MS = 800

/**
 * The accessibility panel on pages without the FAB: sign-in, sign-up,
 * onboarding, the MFA screens. Someone who needs larger text to read the
 * sign-up form should not have to finish signing up to get it.
 */
export function A11yQuickButton() {
  const m = useA11yMessages()
  const fab = useFabPresent()
  const [settled, setSettled] = useState(false)
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // MainLayout mounts its FAB a moment after the router first renders. Waiting
  // for it to stay absent keeps this from flashing up on every main page load
  useEffect(() => {
    if (fab) {
      setSettled(false)
      setOpen(false)
      return
    }
    const t = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(t)
  }, [fab])

  // The panel shortcut and skip link, on the pages where this is the panel
  useEffect(() => {
    if (fab || !settled) return
    return onRequest('panel', () => setOpen(true))
  }, [fab, settled])

  if (fab || !settled) return null

  return (
    <div className="fixed bottom-4 right-4 z-fab flex flex-col items-end gap-2">
      {open && (
        <Suspense fallback={null}>
          <AccessibilityPanel
            onClose={() => {
              setOpen(false)
              buttonRef.current?.focus()
            }}
          />
        </Suspense>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-label={m.panelTitle}
        onClick={() => setOpen((v) => !v)}
        className="flex size-12 items-center justify-center rounded-full bg-ktip-ocean-700 text-white shadow-fab hover:shadow-fab-hover dark:bg-ktip-tropical-500 dark:text-brand-navy"
      >
        <Accessibility aria-hidden="true" className="size-icon-lg" />
      </button>
    </div>
  )
}
