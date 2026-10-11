// The kit's UI, kept off the main entry so a host can lazy-load it: nothing
// here is needed to paint settings, only to change them.
// Styles: import 'a11y-kit/src/css/ui.css' alongside.
export { AccessibilityControls, SECTIONS, resetAllSettings } from './react/AccessibilityControls'
export type { AccessibilityControlsProps, ControlId, SectionId } from './react/AccessibilityControls'
export { AccessibilityPanel } from './react/AccessibilityPanel'
export type { AccessibilityPanelProps } from './react/AccessibilityPanel'
export { ChoiceRow, Section, StepperRow, SwitchRow } from './react/primitives'
export type { ChoiceOption } from './react/primitives'
