import { useMemo } from 'react'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import type { MessageDescriptor } from '@lingui/core'
import type { A11yMessages, A11yTextKey } from '@a11y-kit'

/**
 * The kit's UI strings as Lingui messages, so `i18n:extract` finds them and
 * fr/es get translated with the rest of the catalog. The English here must
 * read the same as the kit's defaults; the kit only falls back to those when
 * a key is missing.
 */
const TEXT: Record<A11yTextKey, MessageDescriptor> = {
  panelTitle: msg`Accessibility`,
  close: msg`Close`,
  resetAll: msg`Reset all`,
  resetSection: msg`Reset`,

  sectionText: msg`Text`,
  sectionColour: msg`Colour and light`,
  sectionReading: msg`Reading`,
  sectionNavigation: msg`Navigation`,
  sectionMotion: msg`Motion`,

  textSize: msg`Text size`,
  font: msg`Font`,
  fontDefault: msg`Default`,
  spacing: msg`Spacing`,
  spacingNormal: msg`Normal`,
  spacingWider: msg`Wider`,
  spacingWidest: msg`Widest`,

  theme: msg`Theme`,
  themeLight: msg`Light`,
  themeDark: msg`Dark`,
  contrast: msg`Contrast`,
  contrastAuto: msg`Device`,
  contrastStandard: msg`Standard`,
  contrastMore: msg`High`,
  contrastHint: msg`Device follows the high-contrast setting on your computer or phone.`,
  pageBrightness: msg`Page brightness`,
  pageContrast: msg`Page contrast`,
  saturation: msg`Colour strength`,
  photoBrightness: msg`Photo brightness`,
  forcedColors: msg`Your device is showing its own high-contrast colours, so the contrast and brightness settings here are paused.`,

  underlineLinks: msg`Underline links`,
  highlightHeadings: msg`Highlight headings`,

  bigTargets: msg`Larger buttons`,
  bigTargetsHint: msg`Buttons and form fields grow to at least 44 pixels.`,
  largeCursor: msg`Large pointer`,
  strongFocus: msg`Strong focus outline`,
  strongFocusHint: msg`A thick yellow and navy ring shows where the keyboard is.`,

  reduceMotion: msg`Reduce motion`,
  reduceMotionHint: msg`Stops animations and page transitions. Your device setting is always respected too.`,
}

/** The kit's messages in the reader's language. Rebuilt when the language changes. */
export function useKtipA11yMessages(): A11yMessages {
  const { i18n } = useLingui()
  return useMemo(() => {
    const text = Object.fromEntries(
      Object.entries(TEXT).map(([key, descriptor]) => [key, i18n._(descriptor)])
    ) as Record<A11yTextKey, string>
    return {
      ...text,
      resetSectionLabel: (section: string) => i18n._(msg`Reset ${section}`),
      decrease: (label: string) => i18n._(msg`Decrease ${label}`),
      increase: (label: string) => i18n._(msg`Increase ${label}`),
    }
    // i18n is a stable singleton; the locale is what changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n, i18n.locale])
}
