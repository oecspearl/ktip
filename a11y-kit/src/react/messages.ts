/**
 * Every string the kit's UI shows, in English. A host passes translations to
 * <A11yProvider messages={...}>; anything it leaves out falls back to these.
 *
 * Strings with a value in them are functions, so a host can pass the value
 * through its own i18n library rather than a template it would mangle. Font
 * names are not here: they are proper names, shown as the host wrote them.
 */
export const DEFAULT_MESSAGES = {
  panelTitle: 'Accessibility',
  close: 'Close',
  resetAll: 'Reset all',
  resetSection: 'Reset',
  resetSectionLabel: (section: string) => `Reset ${section}`,

  sectionText: 'Text',
  sectionColour: 'Colour and light',
  sectionReading: 'Reading',
  sectionNavigation: 'Navigation',
  sectionMotion: 'Motion',

  textSize: 'Text size',
  font: 'Font',
  fontDefault: 'Default',
  spacing: 'Spacing',
  spacingNormal: 'Normal',
  spacingWider: 'Wider',
  spacingWidest: 'Widest',

  theme: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  contrast: 'Contrast',
  contrastAuto: 'Device',
  contrastStandard: 'Standard',
  contrastMore: 'High',
  contrastHint: 'Device follows the high-contrast setting on your computer or phone.',
  pageBrightness: 'Page brightness',
  pageContrast: 'Page contrast',
  saturation: 'Colour strength',
  photoBrightness: 'Photo brightness',
  forcedColors:
    'Your device is showing its own high-contrast colours, so the contrast and brightness settings here are paused.',

  underlineLinks: 'Underline links',
  highlightHeadings: 'Highlight headings',

  bigTargets: 'Larger buttons',
  bigTargetsHint: 'Buttons and form fields grow to at least 44 pixels.',
  largeCursor: 'Large pointer',
  strongFocus: 'Strong focus outline',
  strongFocusHint: 'A thick yellow and navy ring shows where the keyboard is.',

  reduceMotion: 'Reduce motion',
  reduceMotionHint: 'Stops animations and page transitions. Your device setting is always respected too.',

  decrease: (label: string) => `Decrease ${label}`,
  increase: (label: string) => `Increase ${label}`,
}

export type A11yMessages = typeof DEFAULT_MESSAGES
export type A11yMessageKey = keyof A11yMessages
/** Keys whose value is a plain string, e.g. section titles */
export type A11yTextKey = { [K in A11yMessageKey]: A11yMessages[K] extends string ? K : never }[A11yMessageKey]
