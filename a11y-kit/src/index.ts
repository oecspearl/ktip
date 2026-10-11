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
export {
  acquireMic,
  continuousSupported,
  listen,
  micHolder,
  recognitionSupported,
} from './core/speech/recognizer'
export type { ListenOptions, Listener, RecognitionError } from './core/speech/recognizer'
export { matchRoute, normalize, parseNumber, parseVoiceCommand } from './core/voice/grammar'
export type { ParseOptions, VoiceCommand, VoiceRouteLike } from './core/voice/grammar'
export { PHRASES } from './core/voice/phrases'
export type { PhraseTable } from './core/voice/phrases'
export { accessibleName, activate, collectClickables, matchByLabel } from './core/voice/targets'
export type { ReaderCommand } from './core/events'
export { DEFAULT_NEEDS, NO_NEEDS, applyPreset, changedKeys } from './core/setup/presets'
export type { NeedDef, PresetResult } from './core/setup/presets'
export { isSetupActive, shouldOfferSetup, subscribeSetupActive } from './core/setup/flow'
export type { GateState, SetupRun, SetupStage } from './core/setup/flow'
export { blockText, collectReadableBlocks } from './core/reader/blocks'
export { createReader } from './core/reader/engine'
export type { PageReader, ReaderOptions, ReaderProblem, ReaderState, ReaderStatus } from './core/reader/engine'

// React
export { SkipLinks } from './react/SkipLinks'
export type { A11yEvent, A11yFeatures, A11yOptions, A11yRoute, JourneyStop, NavigationAdapter, SetupGate } from './react/options'
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
  useSetupActive,
} from './react/hooks'
