import { createA11yStore, prefersReducedMotionNow as kitReducedMotion } from '@a11y-kit'
import { A11Y_CONFIG } from './config'

/**
 * The app's one accessibility store. Module-level so the old hooks and plain
 * functions can read it without a provider, which keeps every existing
 * component test working unchanged.
 */
export const a11yStore = createA11yStore(A11Y_CONFIG)

/**
 * Should motion be reduced right now: the OS setting or the member's switch.
 * For one-off checks inside effects and handlers; components that re-render on
 * a change use useReducedMotion() instead.
 */
export const prefersReducedMotionNow = () => kitReducedMotion(a11yStore)
