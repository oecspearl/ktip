/**
 * The shapes KTIP exchanges with the accessibility service. Plain types, no
 * browser code, so server-side files (src/types) can use them too.
 */

/** The settings KTIP reads. The service holds more; these are the ones used here */
export interface A11ySettings {
  fontScale: number
  photoBrightness: number
  reduceMotion: boolean
  font: string
  ttsRate: number
  setup: { status: 'kept' | 'reverted' | 'skipped'; at: string } | null
  [key: string]: unknown
}

export type ThemeMode = 'light' | 'dark'

export interface ThemeAdapter {
  get(): ThemeMode
  set(mode: ThemeMode): void
  subscribe(listener: () => void): () => void
}

/** One saved copy of the settings, as the service hands it to KTIP's own storage */
export interface SyncedBlob {
  v: 2
  updatedAt: number
  settings: Partial<A11ySettings>
  theme?: ThemeMode
}

export interface A11yRoute {
  id: string
  path: string
  label: string
  digit?: number
  seq?: string
  voice?: string[]
}

export interface JourneyStop {
  id: string
  path: string
  title: string
  body: string
  target?: string
  tryIt?: string[]
}

export interface SetupGate {
  enabled: boolean
  ready: boolean
  entryPaths: string[]
}

export interface ConfigureInput {
  locale?: string
  navigate?: (path: string) => void
  location?: { get(): string; subscribe(listener: () => void): () => void }
  theme?: ThemeAdapter
  routes?: A11yRoute[]
  targets?: { main?: string; nav?: string }
  onSearch?: (query?: string) => void
  extraShortcuts?: { keys: string; label: string }[]
  isBlocked?: () => boolean
  voiceRestricted?: () => boolean
  panelActions?: { id: string; label: string }[]
  onAction?: (id: string) => void
  sync?: { userId: string | null; remote: SyncedBlob | null | undefined; save(blob: SyncedBlob): unknown }
  setup?: SetupGate
  journey?: JourneyStop[]
  onEvent?: (event: string, props: { stops: number; source: 'auto' | 'panel' }) => void
}
