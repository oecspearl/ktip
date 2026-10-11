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

  voiceNav: msg`Voice commands`,
  voiceNavHint: msg`Control the site by speaking. Works in Chrome, Edge and Safari.`,
  voiceUnsupported: msg`This browser has no speech recognition. Voice commands work in Chrome, Edge and Safari.`,
  voiceMode: msg`Listen`,
  voiceModePush: msg`When I press the microphone`,
  voiceModeContinuous: msg`All the time`,
  voiceListen: msg`Speak a command`,
  voiceStopListening: msg`Stop listening`,
  voiceListening: msg`Listening…`,
  voiceIdle: msg`Press the microphone, or Alt+Shift+V, then speak.`,
  voiceShowHelp: msg`What can I say?`,
  voiceTurnOff: msg`Turn off voice commands`,
  voiceSayNumber: msg`More than one thing matches. Say the number of the one you want.`,
  voiceNumbersShown: msg`Numbers are showing. Say a number to click it.`,
  voiceMicBlocked: msg`The microphone is blocked. Allow it in your browser's site settings, then try again.`,
  voiceUnavailable: msg`Speech recognition is not available in this browser right now.`,
  voiceMicBusy: msg`Live captions are using the microphone, so voice commands are paused.`,
  voiceInCall: msg`During a live call, voice commands listen only when you press the microphone.`,
  voiceIdleOff: msg`Voice commands stopped listening after five minutes without a command.`,
  voiceNoSpeech: msg`I didn't hear anything.`,
  voiceHelpTitle: msg`Voice commands`,
  voiceHelpIntro: msg`Say any of these, in the language the site is showing.`,
  voiceHelpPages: msg`Go to a page`,
  voiceHelpClick: msg`Click a button or link by its name`,
  voiceHelpNumbers: msg`Put a number on everything you can click, then say the number`,
  voiceHelpScroll: msg`Scroll the page`,
  voiceHelpRead: msg`Read the page aloud, then pause or stop`,
  voiceHelpText: msg`Make the text bigger or smaller`,
  voiceHelpSearch: msg`Search the site`,
  voiceHelpBack: msg`Go back a page`,
  voiceHelpSleep: msg`Stop listening`,
  voiceHelpClickExample: msg`sign up`,
  voiceHelpSearchExample: msg`mentors`,
  voiceConsentTitle: msg`Turn on voice commands?`,
  voiceConsentBody: msg`Voice commands use the speech recognition built into your browser. To turn speech into text, Chrome sends your voice to Google, Edge to Microsoft and Safari to Apple. KTIP never receives the recording.`,
  voiceConsentMic: msg`Your browser will ask to use the microphone the first time.`,
  voiceConsentYes: msg`Turn on`,
  voiceConsentNo: msg`Not now`,

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
      voiceHeard: (text: string) => i18n._(msg`Heard “${text}”`),
      voiceNotUnderstood: (text: string) => i18n._(msg`“${text}” is not a command I know. Say “help” for the list.`),
      voiceNoMatch: (label: string) => i18n._(msg`Nothing on this page is called “${label}”.`),
      voiceNumberMissing: (n: number) => i18n._(msg`There is no number ${n} on screen.`),
      voiceGoing: (page: string) => i18n._(msg`Going to ${page}`),
    }
    // i18n is a stable singleton; the locale is what changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n, i18n.locale])
}
