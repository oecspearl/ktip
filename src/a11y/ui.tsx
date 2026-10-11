// The kit's UI, kept out of the entry bundle: it arrives with whichever lazy
// chunk first needs it (the FAB panel, the settings card, the auth-page
// button). Its stylesheet is global (src/index.tsx), because the shortcut
// help dialog and skip links need it before any of these load.

export { AccessibilityControls, AccessibilityPanel } from '@a11y-kit/ui'
