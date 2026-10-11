// Core: framework-free
export {
  DEFAULT_SETTINGS,
  DEFAULT_RANGES,
  resolveConfig,
} from './core/config'
export type {
  A11yKitConfig,
  A11ySettings,
  A11yClasses,
  BooleanKey,
  CaptionsMode,
  ContrastMode,
  CursorMode,
  DeviceState,
  FocusRingMode,
  FontDef,
  LegacyRule,
  NumericKey,
  Range,
  ResolvedConfig,
  SetupRecord,
  SetupStatus,
  ShortcutMode,
  SpacingLevel,
  StoredState,
  ThemeMode,
  VoiceMode,
} from './core/config'
export { sanitize, readStored, paint } from './core/paint'
export { createA11yStore, prefersReducedMotionNow } from './core/store'
export type { A11yStore, StoreEnv } from './core/store'
export { decideSync, toBlob, isSyncedBlob } from './core/sync'
export type { SyncAdapter, SyncedBlob, SyncDecision } from './core/sync'

export {
  DEFAULT_CHORDS,
  RESERVED_CHORDS,
  chordLabel,
  createSequence,
  isEditableTarget,
  matchChord,
  routeChord,
  sameChord,
  shouldIgnoreSingleKey,
} from './core/shortcuts'
export type { Chord, ShortcutAction } from './core/shortcuts'
export { focusElement, headingsIn, landmarksIn, stepHeading } from './core/focus'
export type { Landmark } from './core/focus'
export { announce } from './core/announce'
export { onRequest, openAccessibilityPanel, openShortcutHelp, request } from './core/events'
export type { A11yRequest } from './core/events'

export { BASE_RATE, loadVoices, speakText, speechSupported } from './core/speech/speak'
export type { SpeakOptions } from './core/speech/speak'
export { chunkText, langPrefix, pickVoice, resolveSpeechLang, scoreVoice, speaks, toSpokenText } from './core/speech/voices'
export { blockText, collectReadableBlocks } from './core/reader/blocks'
export { createReader } from './core/reader/engine'
export type { PageReader, ReaderOptions, ReaderProblem, ReaderState, ReaderStatus } from './core/reader/engine'

// React
export { SkipLinks } from './react/SkipLinks'
export type { A11yFeatures, A11yOptions, A11yRoute, NavigationAdapter } from './react/options'
export { BROWSER_NAVIGATION } from './react/options'
export { A11yProvider } from './react/A11yProvider'
export type { A11yProviderProps } from './react/A11yProvider'
export { useA11yContext, useA11yMessages } from './react/context'
export { DEFAULT_MESSAGES } from './react/messages'
export type { A11yMessages, A11yMessageKey, A11yTextKey } from './react/messages'
export type { A11yContextValue, ThemeAdapter } from './react/context'
export {
  useA11yState,
  useA11ySettings,
  useA11yDevice,
  useA11ySetting,
  useReducedMotion,
} from './react/hooks'
