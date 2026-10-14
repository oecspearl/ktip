import { useCallback } from 'react'
import { useA11ySettings, useReducedMotion as useKitReducedMotion } from '@a11y-kit'
import { a11yStore } from '../a11y/store'

/**
 * The member's own "reduce motion" switch, independent of the OS setting.
 *
 * Toggles `html.reduce-motion`, which index.css treats exactly like the media
 * query: keyframes off, transitions off, marquees become scrollable rows.
 * Stored, painted before first render, and synced by the accessibility kit.
 */
export function useReducedMotionPref(): [boolean, (on: boolean) => void] {
  const on = useA11ySettings(a11yStore).reduceMotion
  const setOn = useCallback((next: boolean) => a11yStore.patch({ reduceMotion: next }), [])
  return [on, setOn]
}

/**
 * Should motion be reduced right now? True for the OS setting OR the member's
 * own switch. For JS-driven motion — the hero's auto-rotate, inline
 * transitions — that the CSS blocks cannot reach.
 */
export function useReducedMotion(): boolean {
  return useKitReducedMotion(a11yStore)
}
