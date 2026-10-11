import { useMemo, useState, type ReactNode } from 'react'
import type { A11yStore } from '../core/store'
import type { SyncAdapter } from '../core/sync'
import { A11yContext, type ThemeAdapter } from './context'
import { useRemoteSync } from './useRemoteSync'

export interface A11yProviderProps {
  store: A11yStore
  /** The host's light/dark switch, so presets and sync can include it */
  theme?: ThemeAdapter
  /** Omit to keep settings on the device only */
  sync?: SyncAdapter
  children: ReactNode
}

const DEVICE_ONLY: SyncAdapter = { identity: null, remote: null, write: () => Promise.resolve() }

export function A11yProvider({ store, theme, sync, children }: A11yProviderProps) {
  const [syncHeld, holdSync] = useState(false)
  useRemoteSync({ store, adapter: sync ?? DEVICE_ONLY, theme: theme ?? null, held: syncHeld })

  const value = useMemo(
    () => ({ store, theme: theme ?? null, syncHeld, holdSync }),
    [store, theme, syncHeld]
  )
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>
}
