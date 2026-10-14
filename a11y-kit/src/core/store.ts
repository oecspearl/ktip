import {
  resolveConfig,
  type A11yKitConfig,
  type A11ySettings,
  type DeviceState,
  type ResolvedConfig,
  type StoredState,
} from './config'
import { paint, readStored, sanitize } from './paint'

export interface A11yStore {
  readonly config: ResolvedConfig
  getState(): StoredState
  getSettings(): A11ySettings
  /** A change the member made. Stamps updatedAt so it wins the next sync */
  patch(patch: Partial<A11ySettings>): void
  /** Swap every setting at once, e.g. restoring a snapshot. Also stamps updatedAt */
  replace(settings: A11ySettings): void
  /** Take settings that came from another device, keeping their timestamp */
  adopt(settings: Partial<A11ySettings>, updatedAt: number): void
  /** Device-only state. Never stamps updatedAt, because it is never synced */
  patchDevice(patch: Partial<DeviceState>): void
  /** Mark a synced change made outside the store (the host's theme toggle) */
  touch(): void
  /** Who later changes belong to. Set by the sync layer on sign-in and sign-out */
  setOwner(owner: string | null): void
  subscribe(listener: () => void): () => void
}

export interface StoreEnv {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  root?: HTMLElement
  win?: Window
  now?: () => number
}

function sameSettings(a: A11ySettings, b: A11ySettings): boolean {
  for (const key of Object.keys(a) as (keyof A11ySettings)[]) {
    if (key === 'setup') {
      if (a.setup?.status !== b.setup?.status || a.setup?.at !== b.setup?.at) return false
    } else if (a[key] !== b[key]) {
      return false
    }
  }
  return true
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    // Blocked storage (some private modes, sandboxed frames) throws on access
    return null
  }
}

const NO_STORAGE: Pick<Storage, 'getItem'> = { getItem: () => null }

/**
 * One store per app. It owns the stored state, paints <html> on every change,
 * and notifies subscribers. Built for useSyncExternalStore, so getState()
 * returns the same object until something actually changes.
 */
export function createA11yStore(input: A11yKitConfig = {}, env: StoreEnv = {}): A11yStore {
  const config = resolveConfig(input)
  const storage = env.storage === undefined ? defaultStorage() : env.storage
  const win = env.win ?? (typeof window !== 'undefined' ? window : undefined)
  const root = env.root ?? (typeof document !== 'undefined' ? document.documentElement : undefined)
  const now = env.now ?? Date.now

  let state: StoredState = readStored(storage ?? NO_STORAGE, config)
  let owner: string | null = state.owner
  const listeners = new Set<() => void>()

  const repaint = () => {
    if (root && win) paint(state.settings, config, root, win)
  }

  const commit = (next: StoredState) => {
    state = next
    repaint()
    try {
      storage?.setItem(config.storageKey, JSON.stringify(state))
    } catch {
      // Quota or blocked storage: the change still applies for this session
    }
    listeners.forEach((l) => l())
  }

  // Idempotent with the first-paint script, and the only paint a host
  // without that script gets
  repaint()

  if (win) {
    // Another tab changed something: take it whole, it is already persisted
    win.addEventListener('storage', (e: StorageEvent) => {
      if (e.key !== config.storageKey || !storage) return
      state = readStored(storage, config)
      owner = state.owner
      repaint()
      listeners.forEach((l) => l())
    })
    // 'auto' contrast follows the OS, which can flip while the page is open
    try {
      win.matchMedia?.('(prefers-contrast: more)').addEventListener?.('change', repaint)
    } catch {
      // Old engines without matchMedia listeners keep the load-time value
    }
  }

  const stamp = (settings: A11ySettings): StoredState => ({ ...state, settings, updatedAt: now(), owner })

  return {
    config,
    getState: () => state,
    getSettings: () => state.settings,
    patch(patch) {
      const settings = sanitize({ ...state.settings, ...patch }, config)
      if (sameSettings(settings, state.settings)) return
      commit(stamp(settings))
    },
    replace(settings) {
      commit(stamp(sanitize(settings, config)))
    },
    adopt(settings, updatedAt) {
      const merged = sanitize({ ...state.settings, ...settings }, config)
      commit({ ...state, settings: merged, updatedAt, owner })
    },
    patchDevice(patch) {
      commit({ ...state, device: { ...state.device, ...patch } })
    },
    touch() {
      commit({ ...state, updatedAt: now(), owner })
    },
    setOwner(next) {
      owner = next
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Should motion be reduced right now? The OS setting OR the member's own
 * switch. For JS-driven motion the CSS rules cannot reach.
 */
export function prefersReducedMotionNow(store: A11yStore): boolean {
  if (store.getSettings().reduceMotion) return true
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
