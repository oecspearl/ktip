import type { ThemeAdapter } from '@a11y-kit'

const STORAGE_KEY = 'ktip_theme'
export const THEME_SYNC_EVENT = 'ktip-theme-change'

/**
 * Flip the theme from anywhere: the dark class on <html>, storage, and every
 * mounted useThemeMode. Presets and the setup flow's Revert call this.
 */
export function setThemeMode(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  } catch {
    // localStorage unavailable — mode still applies for this session
  }
  window.dispatchEvent(new CustomEvent(THEME_SYNC_EVENT, { detail: dark }))
}

/** KTIP's theme as the kit sees it, so sync and presets can carry it. */
export const ktipTheme: ThemeAdapter = {
  get: () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  set: (mode) => setThemeMode(mode === 'dark'),
  subscribe(listener) {
    window.addEventListener(THEME_SYNC_EVENT, listener)
    return () => window.removeEventListener(THEME_SYNC_EVENT, listener)
  },
}
