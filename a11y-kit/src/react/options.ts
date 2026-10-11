import type { NeedDef } from '../core/setup/presets'
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

/** One stop on the setup walkthrough. Strings in the reader's language */
export interface JourneyStop {
  id: string
  path: string
  title: string
  body: string
  /** Element to ring; the card centres itself when it is missing */
  target?: string
  /** Controls shown on the card, by id (see ControlId) */
  tryIt?: string[]
}

export interface SetupGate {
  /** Off: never offered unasked, still available from the panel */
  enabled: boolean
  /** The host's own conditions: signed in, onboarding done, nothing else on screen */
  ready: boolean
  /** Pages it may open on by itself */
  entryPaths: string[]
}

export type A11yEvent = 'setup_kept' | 'setup_reverted' | 'setup_skipped'

export interface A11yFeatures {
  shortcuts: boolean
  skipLinks: boolean
  /** The read-aloud bar, its shortcut and its controls */
  reader: boolean
  /** Voice commands, where the browser can recognise speech */
  voice: boolean
}

export interface A11yOptions {
  routes: A11yRoute[]
  navigation: NavigationAdapter | null
  /** Selectors for the main content and the site menu */
  targets: { main: string; nav: string }
  /** Open the host's own search, if it has one, optionally with a spoken query */
  onSearch?: (query?: string) => void
  /** Shortcuts the host already had, listed in the help dialog */
  extraShortcuts: { keys: string; label: string }[]
  /** True while something else owns the plain keys, e.g. a guided tour. Single-key shortcuts pause; Alt+Shift ones keep working */
  isBlocked?: () => boolean
  chords: Record<ShortcutAction, Chord>
  features: A11yFeatures
  /**
   * True while always-on listening would be unsafe, e.g. during a live call,
   * where other people's voices would be taken as commands. Push-to-talk
   * still works.
   */
  voiceRestricted?: () => boolean
  setup: SetupGate
  journey: JourneyStop[]
  needs: NeedDef[]
  /** Outcomes only, for counting. Never the needs, which are health information */
  onEvent?: (event: A11yEvent, props: { stops: number; source: 'auto' | 'panel' }) => void
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
