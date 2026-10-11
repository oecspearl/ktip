import { useMemo, useState, type ReactNode } from 'react'
import type { ShortcutAction, Chord } from '../core/shortcuts'
import type { A11yStore } from '../core/store'
import type { SyncAdapter } from '../core/sync'
import { A11yContext, DEFAULT_OPTIONS, type ThemeAdapter } from './context'
import { DEFAULT_MESSAGES, type A11yMessages } from './messages'
import type { A11yFeatures, A11yOptions, A11yRoute, NavigationAdapter } from './options'
import { ReaderHost } from './ReaderHost'
import { Runtime } from './Runtime'
import { useRemoteSync } from './useRemoteSync'

export interface A11yProviderProps {
  store: A11yStore
  /** The host's light/dark switch, so presets and sync can include it */
  theme?: ThemeAdapter
  /** Omit to keep settings on the device only */
  sync?: SyncAdapter
  /** Translations; anything missing falls back to English */
  messages?: Partial<A11yMessages>
  /** Pages for shortcuts, voice and the setup tour */
  routes?: A11yRoute[]
  /** The host router; without it the kit navigates with full page loads */
  navigation?: NavigationAdapter
  targets?: Partial<A11yOptions['targets']>
  onSearch?: () => void
  extraShortcuts?: A11yOptions['extraShortcuts']
  isBlocked?: () => boolean
  /** Remap any chord, e.g. to dodge a host shortcut */
  chords?: Partial<Record<ShortcutAction, Chord>>
  features?: Partial<A11yFeatures>
  children: ReactNode
}

const DEVICE_ONLY: SyncAdapter = { identity: null, remote: null, write: () => Promise.resolve() }

export function A11yProvider({
  store,
  theme,
  sync,
  messages,
  routes,
  navigation,
  targets,
  onSearch,
  extraShortcuts,
  isBlocked,
  chords,
  features,
  children,
}: A11yProviderProps) {
  const [syncHeld, holdSync] = useState(false)
  useRemoteSync({ store, adapter: sync ?? DEVICE_ONLY, theme: theme ?? null, held: syncHeld })

  const merged = useMemo(() => ({ ...DEFAULT_MESSAGES, ...messages }), [messages])
  const options = useMemo<A11yOptions>(
    () => ({
      routes: routes ?? DEFAULT_OPTIONS.routes,
      navigation: navigation ?? null,
      targets: { ...DEFAULT_OPTIONS.targets, ...targets },
      onSearch,
      extraShortcuts: extraShortcuts ?? DEFAULT_OPTIONS.extraShortcuts,
      isBlocked,
      chords: { ...DEFAULT_OPTIONS.chords, ...chords },
      features: { ...DEFAULT_OPTIONS.features, ...features },
    }),
    [routes, navigation, targets, onSearch, extraShortcuts, isBlocked, chords, features]
  )
  const value = useMemo(
    () => ({ store, theme: theme ?? null, syncHeld, holdSync, messages: merged, options }),
    [store, theme, syncHeld, merged, options]
  )
  return (
    <A11yContext.Provider value={value}>
      {children}
      {options.features.shortcuts && <Runtime />}
      {options.features.reader && <ReaderHost />}
    </A11yContext.Provider>
  )
}
