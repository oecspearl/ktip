import { useMemo, useState, type ReactNode } from 'react'
import type { A11yStore } from '../core/store'
import type { SyncAdapter } from '../core/sync'
import { A11yContext, type ThemeAdapter } from './context'
import { DEFAULT_MESSAGES, type A11yMessages } from './messages'
import { useRemoteSync } from './useRemoteSync'

export interface A11yProviderProps {
  store: A11yStore
  /** The host's light/dark switch, so presets and sync can include it */
  theme?: ThemeAdapter
  /** Omit to keep settings on the device only */
  sync?: SyncAdapter
  /** Translations; anything missing falls back to English */
  messages?: Partial<A11yMessages>
  children: ReactNode
}

const DEVICE_ONLY: SyncAdapter = { identity: null, remote: null, write: () => Promise.resolve() }

export function A11yProvider({ store, theme, sync, messages, children }: A11yProviderProps) {
  const [syncHeld, holdSync] = useState(false)
  useRemoteSync({ store, adapter: sync ?? DEVICE_ONLY, theme: theme ?? null, held: syncHeld })

  const merged = useMemo(() => ({ ...DEFAULT_MESSAGES, ...messages }), [messages])
  const value = useMemo(
    () => ({ store, theme: theme ?? null, syncHeld, holdSync, messages: merged }),
    [store, theme, syncHeld, merged]
  )
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>
}
