import type { Chord, ShortcutAction } from '../core/shortcuts'

/** A page the shortcuts, voice commands and setup tour can take someone to. */
export interface A11yRoute {
  id: string
  path: string
  /** In the reader's language */
  label: string
  /** Alt+Shift+digit, 1 to 9 */
  digit?: number
  /** Second key of "g" then a letter, single-key mode only */
  seq?: string
  /** Extra spoken names for voice navigation, in the reader's language */
  voice?: string[]
}

/** The host router, seen through two functions. Any router works. */
export interface NavigationAdapter {
  navigate(path: string): void
  location: { get(): string; subscribe(listener: () => void): () => void }
}

export interface A11yFeatures {
  shortcuts: boolean
  skipLinks: boolean
  /** The read-aloud bar, its shortcut and its controls */
  reader: boolean
}

export interface A11yOptions {
  routes: A11yRoute[]
  navigation: NavigationAdapter | null
  /** Selectors for the main content and the site menu */
  targets: { main: string; nav: string }
  /** Open the host's own search, if it has one */
  onSearch?: () => void
  /** Shortcuts the host already had, listed in the help dialog */
  extraShortcuts: { keys: string; label: string }[]
  /** True while something else owns the plain keys, e.g. a guided tour. Single-key shortcuts pause; Alt+Shift ones keep working */
  isBlocked?: () => boolean
  chords: Record<ShortcutAction, Chord>
  features: A11yFeatures
}

/** Without a router the kit falls back to a full page load. */
export const BROWSER_NAVIGATION: NavigationAdapter = {
  navigate: (path) => window.location.assign(path),
  location: {
    get: () => window.location.pathname + window.location.hash,
    subscribe(listener) {
      window.addEventListener('popstate', listener)
      return () => window.removeEventListener('popstate', listener)
    },
  },
}
