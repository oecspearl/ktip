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

// React
export { A11yProvider } from './react/A11yProvider'
export type { A11yProviderProps } from './react/A11yProvider'
export { useA11yContext } from './react/context'
export type { A11yContextValue, ThemeAdapter } from './react/context'
export {
  useA11yState,
  useA11ySettings,
  useA11yDevice,
  useA11ySetting,
  useReducedMotion,
} from './react/hooks'
