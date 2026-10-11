import { createContext, useContext } from 'react'
import type { ThemeMode } from '../core/config'
import type { A11yStore } from '../core/store'

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
}

export const A11yContext = createContext<A11yContextValue | null>(null)

export function useA11yContext(): A11yContextValue {
  const ctx = useContext(A11yContext)
  if (!ctx) throw new Error('a11y-kit: wrap the app in <A11yProvider>')
  return ctx
}

/** The store passed in, else the provider's. Lets hooks work outside a provider. */
export function useResolvedStore(store?: A11yStore): A11yStore {
  const ctx = useContext(A11yContext)
  const resolved = store ?? ctx?.store
  if (!resolved) throw new Error('a11y-kit: pass a store or wrap the app in <A11yProvider>')
  return resolved
}
