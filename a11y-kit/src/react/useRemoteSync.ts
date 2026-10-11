import { useCallback, useEffect, useRef } from 'react'
import type { A11yStore } from '../core/store'
import { decideSync, toBlob, type SyncAdapter } from '../core/sync'
import type { ThemeAdapter } from './context'

interface Options {
  store: A11yStore
  adapter: SyncAdapter
  theme: ThemeAdapter | null
  /** Hold writes (a setup trial in progress); they flush when released */
  held: boolean
  debounceMs?: number
}

/**
 * Carries settings between this device and the user's record, both ways.
 *
 * On each sign-in the newer side wins (decideSync). After that, local changes
 * are written back coalesced and fire-and-forget: a failed write never
 * surfaces, because the change has already applied and been stored here, and
 * the next change retries it. A remote change that arrives later wins only if
 * it is newer, so a stale refetch cannot undo a toggle just pressed.
 */
export function useRemoteSync({ store, adapter, theme, held, debounceMs = 600 }: Options) {
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter
  const themeRef = useRef(theme)
  themeRef.current = theme
  const heldRef = useRef(held)
  heldRef.current = held

  /** Identity whose sign-in decision has been made */
  const settled = useRef<string | null>(null)
  /** updatedAt the server is known to hold */
  const written = useRef(-1)
  const adopting = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback(() => {
    const a = adapterRef.current
    if (!a.identity || settled.current !== a.identity || heldRef.current) return
    const state = store.getState()
    if (state.updatedAt <= written.current) return
    const stamp = state.updatedAt
    a.write(toBlob(state, themeRef.current?.get())).then(
      () => {
        if (written.current < stamp) written.current = stamp
      },
      () => {
        // Left unwritten; the next change carries it
      }
    )
  }, [store])

  const schedule = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, debounceMs)
  }, [flush, debounceMs])

  // The host's theme toggle is a synced change like any other
  useEffect(() => {
    if (!theme) return
    return theme.subscribe(() => {
      if (!adopting.current) store.touch()
    })
  }, [theme, store])

  const { identity, remote } = adapter
  const remoteKey = remote === undefined ? 'loading' : remote === null ? 'none' : String(remote.updatedAt)

  useEffect(() => {
    if (!identity) {
      settled.current = null
      written.current = -1
      store.setOwner(null)
      return
    }
    if (remote === undefined) return

    const local = store.getState()
    const first = settled.current !== identity
    const decision = decideSync(first ? local : { ...local, owner: identity }, identity, remote)
    store.setOwner(identity)
    settled.current = identity

    if (decision === 'adopt' && remote) {
      adopting.current = true
      try {
        store.adopt(remote.settings, remote.updatedAt)
        const t = themeRef.current
        if (remote.theme && t && t.get() !== remote.theme) t.set(remote.theme)
      } finally {
        adopting.current = false
      }
      written.current = remote.updatedAt
      return
    }
    if (remote) written.current = Math.max(written.current, remote.updatedAt)
    if (decision === 'push') schedule()
    // remoteKey stands in for `remote`, whose object identity changes on every refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, remoteKey, store, schedule])

  useEffect(() => store.subscribe(schedule), [store, schedule])

  // Releasing a hold sends whatever accumulated during it
  useEffect(() => {
    if (!held) schedule()
  }, [held, schedule])

  useEffect(() => () => clearTimeout(timer.current), [])
}
