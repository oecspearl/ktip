import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { onRequest } from '../../core/events'
import { readRun, setSetupActive, shouldOfferSetup, writeRun, type SetupRun } from '../../core/setup/flow'
import type { SetupStatus } from '../../core/config'
import { useA11yContext } from '../context'
import { useA11ySettings } from '../hooks'
import { BROWSER_NAVIGATION } from '../options'

const SetupFlow = lazy(() => import('./SetupFlow').then((m) => ({ default: m.SetupFlow })))

/** How long a page has to settle before setup opens over it. */
const OPEN_DELAY_MS = 800

const storage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// "Ask me later" lasts for this page session, across route changes
let snoozedThisSession = false

/**
 * Owns the setup run: when it opens by itself, the "run setup again"
 * request, resuming after a reload, and holding account sync while the
 * member is only trying things out, so a half-tried preset never reaches
 * their other devices.
 */
export function SetupHost() {
  const { store, theme, options, holdSync } = useA11yContext()
  const { setup: record } = useA11ySettings(store)
  const [run, setRunState] = useState<SetupRun | null>(() => readRun(storage(), store.config.storageKey))
  const [snoozed, setSnoozed] = useState(snoozedThisSession)
  const nav = options.navigation ?? BROWSER_NAVIGATION
  const path = useSyncExternalStore(nav.location.subscribe, nav.location.get, nav.location.get)

  const setRun = useCallback(
    (next: SetupRun | null) => {
      setRunState(next)
      writeRun(storage(), store.config.storageKey, next)
    },
    [store]
  )

  const begin = useCallback(
    (source: SetupRun['source']) => {
      setRun({
        stage: 'intro',
        stop: 0,
        // Pre-filled from the last run on this device
        needs: store.getState().device.needs,
        snapshot: { settings: store.getSettings(), theme: theme?.get() },
        declined: [],
        textTour: false,
        startedAt: Date.now(),
        source,
      })
    },
    [setRun, store, theme]
  )

  useEffect(() => onRequest('setup', () => begin('panel')), [begin])

  useEffect(() => {
    if (run) return
    if (!shouldOfferSetup({ ...options.setup, record, snoozed, path })) return
    // Waits out anything else holding the screen, such as a page tour that
    // started first, rather than opening on top of it
    const t = setInterval(() => {
      if (options.isBlocked?.()) return
      clearInterval(t)
      begin('auto')
    }, OPEN_DELAY_MS)
    return () => clearInterval(t)
  }, [run, options.setup, record, snoozed, path, begin])

  const active = !!run
  useEffect(() => {
    setSetupActive(active)
    holdSync(active)
  }, [active, holdSync])

  const finish = useCallback(
    (status: SetupStatus | 'later') => {
      const current = run
      setRun(null)
      if (!current) return
      if (status === 'later') {
        snoozedThisSession = true
        setSnoozed(true)
        // Nothing was decided: put back whatever was being tried
        store.replace(current.snapshot.settings)
        if (current.snapshot.theme) theme?.set(current.snapshot.theme)
        return
      }
      const setup = { status, at: new Date().toISOString() }
      if (status === 'reverted') {
        store.replace({ ...current.snapshot.settings, setup })
        if (current.snapshot.theme) theme?.set(current.snapshot.theme)
      } else {
        store.patch({ setup })
      }
      // The needs stay on this device only, to pre-fill a later run
      store.patchDevice({ needs: current.needs })
      options.onEvent?.(`setup_${status}`, { stops: current.stage === 'intro' ? 0 : current.stop + 1, source: current.source })
    },
    [run, setRun, store, theme, options]
  )

  if (!run) return null
  return (
    <Suspense fallback={null}>
      <SetupFlow run={run} update={setRun} finish={finish} />
    </Suspense>
  )
}
