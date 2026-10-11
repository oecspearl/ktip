import { useSyncExternalStore } from 'react'
import type { A11ySettings, ConfigureInput } from './types'

export type * from './types'

/**
 * KTIP's view of the hosted accessibility service (Viridion Accessibility).
 * index.html loads it from VITE_A11Y_ORIGIN; its first-paint script defines
 * window.ViridionA11y before any of our code runs. Every function here still
 * answers sensibly if the service failed to load: defaults, no microphone
 * lock, the OS motion setting.
 */

interface ViridionApi {
  ready: boolean
  configure(input: ConfigureInput): void
  getSettings(): A11ySettings
  subscribe(listener: () => void): () => void
  set(patch: Partial<A11ySettings>): void
  open(kind?: 'panel' | 'help' | 'setup' | 'read' | 'voice', opts?: { anchor?: HTMLElement }): void
  isSetupActive(): boolean
  onSetupActive(listener: () => void): () => void
  acquireMic(owner: string, priority?: number, onPreempt?: () => void): (() => void) | null
  prefersReducedMotion(): boolean
  speak(text: string, opts?: { lang?: string; onEnd?: () => void; onError?: () => void }): () => void
  speechSupported(): boolean
}

declare global {
  interface Window {
    ViridionA11y?: ViridionApi
  }
}

const api = (): ViridionApi | undefined => (typeof window === 'undefined' ? undefined : window.ViridionA11y)

const DEFAULTS: A11ySettings = {
  fontScale: 1,
  photoBrightness: 1,
  reduceMotion: false,
  font: 'default',
  ttsRate: 1,
  setup: null,
}

export const getA11ySettings = (): A11ySettings => api()?.getSettings() ?? DEFAULTS
const subscribeSettings = (listener: () => void) => api()?.subscribe(listener) ?? (() => {})

/** The settings, re-rendering when any of them changes */
export function useA11ySettings(): A11ySettings {
  return useSyncExternalStore(subscribeSettings, getA11ySettings, getA11ySettings)
}

export const setA11ySettings = (patch: Partial<A11ySettings>) => api()?.set(patch)

export const configureA11y = (input: ConfigureInput) => api()?.configure(input)

export const openA11y = (kind: 'panel' | 'help' | 'setup' | 'read' | 'voice' = 'panel', anchor?: HTMLElement) =>
  api()?.open(kind, anchor ? { anchor } : undefined)

const osReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Should motion be reduced right now: the OS setting or the member's switch.
 * For one-off checks in effects and handlers; components use useReducedMotion().
 */
export const prefersReducedMotionNow = (): boolean => api()?.prefersReducedMotion() ?? osReducedMotion()

/** One speech recogniser per page: live captions and voice commands take turns through this */
export const acquireMic = (owner: string, priority = 0, onPreempt?: () => void): (() => void) | null =>
  api() ? api()!.acquireMic(owner, priority, onPreempt) : () => {}

export const isSetupActive = (): boolean => api()?.isSetupActive() ?? false
const subscribeSetup = (listener: () => void) => api()?.onSetupActive(listener) ?? (() => {})

/** True while the guided accessibility setup runs; page tours wait for it */
export function useSetupActive(): boolean {
  return useSyncExternalStore(subscribeSetup, isSetupActive, () => false)
}

export const speechSupported = (): boolean =>
  api()?.speechSupported() ?? (typeof window !== 'undefined' && 'speechSynthesis' in window)

export const speak = (text: string, opts?: { lang?: string; onEnd?: () => void; onError?: () => void }) =>
  api()?.speak(text, opts) ?? (() => {})
