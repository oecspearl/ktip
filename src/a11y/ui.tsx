// The kit's UI and its stylesheet, in one module so they arrive together in
// whichever lazy chunk first needs them (the FAB panel, the settings card, the
// auth-page button) and stay out of the entry bundle.
import '@a11y-kit/css/ui.css'

export { AccessibilityControls, AccessibilityPanel } from '@a11y-kit/ui'
