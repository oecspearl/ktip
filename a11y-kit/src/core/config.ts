/**
 * Settings shape, defaults, ranges and the host configuration.
 *
 * Everything in this file is plain data and DOM-free. The Vite plugin imports
 * it on the server to build the first-paint script, so a DOM type or a
 * function here would either fail the server typecheck or fail to serialise.
 */

export type ContrastMode = 'auto' | 'standard' | 'more'
export type CursorMode = 'default' | 'large'
export type FocusRingMode = 'default' | 'strong'
export type ShortcutMode = 'off' | 'modifier' | 'all'
export type VoiceMode = 'push' | 'continuous'
export type CaptionsMode = 'auto' | 'on'
export type SpacingLevel = 0 | 1 | 2
export type SetupStatus = 'kept' | 'reverted' | 'skipped'
export type ThemeMode = 'light' | 'dark'

export interface SetupRecord {
  status: SetupStatus
  /** ISO timestamp */
  at: string
}

/** Everything here follows the member between devices when the host syncs. */
export interface A11ySettings {
  /** Multiplier on the root font size; every rem-sized length follows it */
  fontScale: number
  /** 'default', or the id of one of the host's fonts */
  font: string
  /** Line, letter and word spacing. 2 is the WCAG 1.4.12 text-spacing set */
  spacing: SpacingLevel
  /** 'auto' follows the OS high-contrast setting */
  contrast: ContrastMode
  pageBrightness: number
  pageContrast: number
  saturation: number
  /** brightness() on photography only, through --photo-brightness */
  photoBrightness: number
  underlineLinks: boolean
  highlightHeadings: boolean
  bigTargets: boolean
  cursor: CursorMode
  focusRing: FocusRingMode
  reduceMotion: boolean
  readerBar: boolean
  ttsRate: number
  shortcuts: ShortcutMode
  focusOnNavigate: boolean
  voiceNav: boolean
  voiceMode: VoiceMode
  captions: CaptionsMode
  /** How the first-run setup ended, so no device offers it twice */
  setup: SetupRecord | null
}

/**
 * Kept on this device and never synced. `needs` is disability information:
 * it must not reach a server or an analytics event.
 */
export interface DeviceState {
  needs: string[]
  /** Chosen voiceURI per language prefix, e.g. { en: '...', fr: '...' } */
  ttsVoice: Record<string, string>
  voiceConsentAt: string | null
}

export interface StoredState {
  v: 2
  /** ms epoch of the last synced change; 0 = never changed on this device */
  updatedAt: number
  /** User id the settings were last changed under; null = signed out */
  owner: string | null
  settings: A11ySettings
  device: DeviceState
}

export interface Range {
  min: number
  max: number
  step: number
}

export type NumericKey =
  | 'fontScale'
  | 'pageBrightness'
  | 'pageContrast'
  | 'saturation'
  | 'photoBrightness'
  | 'ttsRate'

export type BooleanKey =
  | 'underlineLinks'
  | 'highlightHeadings'
  | 'bigTargets'
  | 'reduceMotion'
  | 'readerBar'
  | 'focusOnNavigate'
  | 'voiceNav'

export const DEFAULT_SETTINGS: A11ySettings = {
  fontScale: 1,
  font: 'default',
  spacing: 0,
  contrast: 'auto',
  pageBrightness: 1,
  pageContrast: 1,
  saturation: 1,
  photoBrightness: 1,
  underlineLinks: false,
  highlightHeadings: false,
  bigTargets: false,
  cursor: 'default',
  focusRing: 'default',
  reduceMotion: false,
  readerBar: false,
  ttsRate: 1,
  shortcuts: 'modifier',
  focusOnNavigate: false,
  voiceNav: false,
  voiceMode: 'push',
  captions: 'auto',
  setup: null,
}

/**
 * Bounds, not suggestions: a stored value outside them is clamped on read, so
 * a hand-edited storage entry cannot render the app unusable.
 */
export const DEFAULT_RANGES: Record<NumericKey, Range> = {
  fontScale: { min: 0.9, max: 1.5, step: 0.05 },
  pageBrightness: { min: 0.5, max: 1.2, step: 0.05 },
  pageContrast: { min: 0.8, max: 1.5, step: 0.05 },
  saturation: { min: 0, max: 1, step: 0.1 },
  photoBrightness: { min: 0.6, max: 1.6, step: 0.1 },
  ttsRate: { min: 0.5, max: 2, step: 0.1 },
}

/** Class names the kit toggles on <html>. */
export interface A11yClasses {
  contrastMore: string
  underlineLinks: string
  highlightHeadings: string
  bigTargets: string
  cursorLarge: string
  focusStrong: string
  reduceMotion: string
}

export interface FontDef {
  id: string
  /** Shown in the font picker. Use the font's own name; it is not translated */
  label: string
  /** Class toggled on <html> while this font is chosen */
  className?: string
  /** Stylesheet loaded the first time the font is chosen, never before */
  href?: string
  preconnect?: { href: string; cors?: boolean }[]
}

export interface LegacyRule {
  /** A storage key from before the kit */
  key: string
  /** Applies `set` when the stored string equals this */
  equals: string
  set: Partial<A11ySettings>
}

export interface A11yKitConfig {
  /** localStorage key for the whole state */
  storageKey?: string
  /** Prefix for the default class names and the spacing attribute */
  prefix?: string
  classes?: Partial<A11yClasses>
  fonts?: FontDef[]
  defaults?: Partial<A11ySettings>
  ranges?: Partial<Record<NumericKey, Range>>
  /**
   * Read once, when the storage key holds no versioned state yet. `fields`
   * renames keys of an older object under `storageKey`; `keys` maps other
   * storage entries to settings.
   */
  legacy?: { fields?: Record<string, keyof A11ySettings>; keys?: LegacyRule[] }
}

/** The fully-defaulted, JSON-safe form every runtime piece works from. */
export interface ResolvedConfig {
  storageKey: string
  prefix: string
  classes: A11yClasses
  spacingAttr: string
  fonts: (FontDef & { className: string })[]
  defaults: A11ySettings
  ranges: Record<NumericKey, Range>
  legacy: { fields: Record<string, keyof A11ySettings>; keys: LegacyRule[] }
}

export function resolveConfig(config: A11yKitConfig = {}): ResolvedConfig {
  const prefix = config.prefix ?? 'a11y-'
  return {
    storageKey: config.storageKey ?? 'a11y',
    prefix,
    classes: {
      contrastMore: `${prefix}contrast-more`,
      underlineLinks: `${prefix}underline`,
      highlightHeadings: `${prefix}headings`,
      bigTargets: `${prefix}targets`,
      cursorLarge: `${prefix}cursor`,
      focusStrong: `${prefix}focus`,
      reduceMotion: `${prefix}reduce-motion`,
      ...config.classes,
    },
    spacingAttr: `data-${prefix}spacing`,
    fonts: (config.fonts ?? []).map((f) => ({ ...f, className: f.className ?? `${prefix}font-${f.id}` })),
    defaults: { ...DEFAULT_SETTINGS, ...config.defaults },
    ranges: { ...DEFAULT_RANGES, ...config.ranges },
    legacy: { fields: config.legacy?.fields ?? {}, keys: config.legacy?.keys ?? [] },
  }
}
