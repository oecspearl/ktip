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

  shortcuts: msg`Keyboard shortcuts`,
  shortcutsOff: msg`Off`,
  shortcutsModifier: msg`With Alt+Shift`,
  shortcutsAll: msg`Also single keys`,
  shortcutsHint: msg`Single-key shortcuts can clash with a screen reader. Leave them off if you use one.`,
  viewShortcuts: msg`Show all shortcuts`,
  focusOnNavigate: msg`Focus the page title after moving page`,
  focusOnNavigateHint: msg`Keyboard and screen reader users start at the top of each new page.`,

  shortcutsTitle: msg`Keyboard shortcuts`,
  shortcutsIntro: msg`Hold Alt and Shift (Option and Shift on a Mac) and press a key.`,
  groupPages: msg`Go to a page`,
  groupPage: msg`On this page`,
  groupSettings: msg`Settings`,
  groupSingle: msg`Single keys`,
  groupSite: msg`Also on this site`,
  headingsHere: msg`Headings on this page`,
  noHeadings: msg`This page has no headings.`,
  actionMain: msg`Jump to the main content`,
  actionNav: msg`Jump to the site menu`,
  actionSearch: msg`Search`,
  actionPanel: msg`Open accessibility settings`,
  actionRead: msg`Read the page aloud, or pause`,
  actionVoice: msg`Listen for a voice command`,
  actionHelp: msg`Show this list`,
  actionTextUp: msg`Larger text`,
  actionTextDown: msg`Smaller text`,
  actionTextReset: msg`Text back to normal size`,
  actionNextHeading: msg`Next heading`,
  actionPrevHeading: msg`Previous heading`,
  singleHelp: msg`Show this list`,
  noMoreHeadings: msg`No more headings`,

  readerBar: msg`Reading bar`,
  readerBarHint: msg`Play, pause and skip controls for having pages read aloud.`,
  readingSpeed: msg`Reading speed`,
  ttsVoice: msg`Voice`,
  ttsVoiceAuto: msg`Best available`,
  readerTitle: msg`Read aloud`,
  readPage: msg`Read this page aloud`,
  pause: msg`Pause`,
  resume: msg`Carry on reading`,
  stop: msg`Stop`,
  prevBlock: msg`Previous paragraph`,
  nextBlock: msg`Next paragraph`,
  clickToRead: msg`Click a paragraph to read from there`,
  clickToReadOn: msg`Click any paragraph to hear it. Press Escape to stop.`,
  readSelection: msg`Read the selected text`,
  closeReader: msg`Close the reading bar`,
  readingNow: msg`Reading`,
  nothingToRead: msg`There is nothing to read on this page.`,

  skipToMain: msg`Skip to main content`,
  skipToNav: msg`Skip to the site menu`,
  skipToSearch: msg`Skip to search`,
  skipToSettings: msg`Accessibility settings`,
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
      singleGo: (page: string) => i18n._(msg`Go to ${page}`),
      textSizeIs: (percent: string) => i18n._(msg`Text size ${percent}`),
      readingProgress: (n: number, total: number) => i18n._(msg`Reading ${n} of ${total}`),
      readingSpeedIs: (speed: string) => i18n._(msg`Reading speed ${speed}. Change speed`),
      noVoice: (language: string) =>
        i18n._(msg`This device has no ${language} voice. Add one in your system's speech settings.`),
    }
    // i18n is a stable singleton; the locale is what changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n, i18n.locale])
}
