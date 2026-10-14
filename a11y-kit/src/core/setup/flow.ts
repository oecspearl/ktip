import type { A11ySettings, SetupRecord, ThemeMode } from '../config'

export type SetupStage = 'intro' | 'needs' | 'preview' | 'journey' | 'review'

/**
 * A setup run in progress. Kept in storage so a reload, or a journey stop on
 * a page that does a full load, picks up where it was. Expires after a day:
 * a run left open on Monday should not ambush someone on Friday.
 */
export interface SetupRun {
  stage: SetupStage
  stop: number
  needs: string[]
  /** Settings and theme from before the run, for Revert */
  snapshot: { settings: A11ySettings; theme?: ThemeMode }
  /** Changes the member switched back off in the preview */
  declined: (keyof A11ySettings)[]
  textTour: boolean
  startedAt: number
  /** Where the run was started from */
  source: 'auto' | 'panel'
}

const DAY = 24 * 60 * 60 * 1000

export function runKey(storageKey: string) {
  return `${storageKey}_setup_run`
}

export function readRun(storage: Pick<Storage, 'getItem'> | null, storageKey: string, now = Date.now()): SetupRun | null {
  try {
    const raw = storage?.getItem(runKey(storageKey))
    if (!raw) return null
    const run = JSON.parse(raw) as SetupRun
    if (!run || typeof run.startedAt !== 'number' || now - run.startedAt > DAY) return null
    return run
  } catch {
    return null
  }
}

export function writeRun(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, storageKey: string, run: SetupRun | null) {
  try {
    if (run) storage?.setItem(runKey(storageKey), JSON.stringify(run))
    else storage?.removeItem(runKey(storageKey))
  } catch {
    // The run still works for this page view
  }
}

export interface GateState {
  /** The host's own conditions: signed in, onboarding done, no other first-run screen showing */
  ready: boolean
  enabled: boolean
  record: SetupRecord | null
  snoozed: boolean
  path: string
  entryPaths: string[]
}

/**
 * Offer setup on its own, unasked? Only once per member (any device: the
 * record syncs), only when nothing else is in the way, and only on a page
 * where landing on a dialog makes sense: never a form, a call or a legal page.
 */
export function shouldOfferSetup(g: GateState): boolean {
  if (!g.enabled || !g.ready || g.record || g.snoozed) return false
  // Exact: /projects is an entry page, /projects/new is a form
  const path = g.path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  return g.entryPaths.includes(path)
}

// ---- Is a run active right now? -------------------------------------------------
// Read by the host's own tours, which must not start over the top of setup.
let active = false
const listeners = new Set<() => void>()

export function setSetupActive(on: boolean) {
  if (active === on) return
  active = on
  listeners.forEach((l) => l())
}
export const isSetupActive = () => active
export function subscribeSetupActive(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
