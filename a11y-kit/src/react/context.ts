import { createContext, useContext } from 'react'
import type { ThemeMode } from '../core/config'
import { DEFAULT_CHORDS } from '../core/shortcuts'
import type { A11yStore } from '../core/store'
import { DEFAULT_MESSAGES, type A11yMessages } from './messages'
import type { A11yOptions } from './options'

/** The host's light/dark switch. The kit reads and sets it, never owns it. */
export interface ThemeAdapter {
  get(): ThemeMode
  set(mode: ThemeMode): void
  subscribe(listener: () => void): () => void
}

export interface A11yContextValue {
  store: A11yStore
  theme: ThemeAdapter | null
  /** True while remote writes are held, e.g. during a setup trial run */
  syncHeld: boolean
  holdSync(held: boolean): void
  messages: A11yMessages
  options: A11yOptions
}

export const DEFAULT_OPTIONS: A11yOptions = {
  routes: [],
  navigation: null,
  targets: { main: 'main, [role="main"]', nav: 'nav, [role="navigation"]' },
  extraShortcuts: [],
  chords: DEFAULT_CHORDS,
  features: { shortcuts: true, skipLinks: true, reader: true, voice: true },
}

export const A11yContext = createContext<A11yContextValue | null>(null)

export function useA11yContext(): A11yContextValue {
  const ctx = useContext(A11yContext)
  if (!ctx) throw new Error('a11y-kit: wrap the app in <A11yProvider>')
  return ctx
}

/** The UI strings: the host's translations over the English defaults. */
export function useA11yMessages(): A11yMessages {
  return useContext(A11yContext)?.messages ?? DEFAULT_MESSAGES
}

/** The store passed in, else the provider's. Lets hooks work outside a provider. */
export function useResolvedStore(store?: A11yStore): A11yStore {
  const ctx = useContext(A11yContext)
  const resolved = store ?? ctx?.store
  if (!resolved) throw new Error('a11y-kit: pass a store or wrap the app in <A11yProvider>')
  return resolved
}
