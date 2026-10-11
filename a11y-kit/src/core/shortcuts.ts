/**
 * Keyboard shortcut primitives. Framework-free and DOM-light so they test in
 * isolation.
 *
 * Chords match on KeyboardEvent.code, the physical key, not .key: Option+Shift+1
 * on a Mac produces "⁄", and Alt+Shift+digit gives a symbol on many layouts,
 * so .key would never equal "1".
 */

export interface Chord {
  code: string
  alt?: boolean
  shift?: boolean
  ctrl?: boolean
  meta?: boolean
}

export type ShortcutAction =
  | 'main'
  | 'nav'
  | 'search'
  | 'panel'
  | 'read'
  | 'voice'
  | 'help'
  | 'textUp'
  | 'textDown'
  | 'textReset'
  | 'nextHeading'
  | 'prevHeading'

const altShift = (code: string): Chord => ({ code, alt: true, shift: true })

/**
 * Alt+Shift (Option+Shift on a Mac) plus one key. Screen readers keep their
 * own modifiers (NVDA and JAWS use Insert or Caps Lock, VoiceOver Ctrl+Option)
 * and single letters in browse mode, so this layer leaves them alone. Letters
 * avoid RESERVED_CHORDS.
 */
export const DEFAULT_CHORDS: Record<ShortcutAction, Chord> = {
  main: altShift('KeyC'),
  nav: altShift('KeyG'),
  search: altShift('KeyF'),
  panel: altShift('KeyA'),
  read: altShift('KeyR'),
  voice: altShift('KeyV'),
  help: altShift('KeyK'),
  textUp: altShift('Equal'),
  textDown: altShift('Minus'),
  textReset: altShift('Digit0'),
  nextHeading: altShift('ArrowDown'),
  prevHeading: altShift('ArrowUp'),
}

/** Page shortcuts are Alt+Shift+1 to Alt+Shift+9. */
export const routeChord = (digit: number): Chord => altShift(`Digit${digit}`)

/**
 * Taken by the browser or the OS. A chord here would either never reach the
 * page or would steal a key someone relies on, so the defaults avoid them and
 * a test holds that line.
 */
export const RESERVED_CHORDS: { chord: Chord; owner: string }[] = [
  { chord: altShift('KeyI'), owner: 'Chrome: report an issue' },
  { chord: altShift('KeyT'), owner: 'Chrome: focus the toolbar' },
  { chord: altShift('KeyM'), owner: 'ChromeOS: Files' },
  { chord: altShift('KeyN'), owner: 'ChromeOS: notifications' },
  { chord: altShift('KeyS'), owner: 'ChromeOS: quick settings' },
  { chord: altShift('KeyL'), owner: 'ChromeOS: launcher' },
  { chord: altShift('KeyP'), owner: 'ChromeOS: pin windows' },
]

export function sameChord(a: Chord, b: Chord): boolean {
  return (
    a.code === b.code &&
    !!a.alt === !!b.alt &&
    !!a.shift === !!b.shift &&
    !!a.ctrl === !!b.ctrl &&
    !!a.meta === !!b.meta
  )
}

type KeyLike = Pick<KeyboardEvent, 'code' | 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>

export function matchChord(e: KeyLike, chord: Chord): boolean {
  // Numpad digits count as the digit row
  const code = e.code.startsWith('Numpad') && /\d$/.test(e.code) ? `Digit${e.code.slice(-1)}` : e.code
  return (
    code === chord.code &&
    e.altKey === !!chord.alt &&
    e.shiftKey === !!chord.shift &&
    e.ctrlKey === !!chord.ctrl &&
    e.metaKey === !!chord.meta
  )
}

const KEY_NAMES: Record<string, string> = {
  Equal: '=',
  Minus: '-',
  ArrowDown: '↓',
  ArrowUp: '↑',
  Slash: '/',
}

/** Human form of a chord: "Alt+Shift+C", or "⌥⇧C" on a Mac. */
export function chordLabel(chord: Chord, mac = isMac()): string {
  const key = KEY_NAMES[chord.code] ?? chord.code.replace(/^(Key|Digit)/, '')
  if (mac) return `${chord.ctrl ? '⌃' : ''}${chord.alt ? '⌥' : ''}${chord.shift ? '⇧' : ''}${chord.meta ? '⌘' : ''}${key}`
  return [chord.ctrl && 'Ctrl', chord.alt && 'Alt', chord.shift && 'Shift', chord.meta && 'Meta', key].filter(Boolean).join('+')
}

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

/** A field that takes typing: inputs, text areas, selects, rich editors, ARIA textboxes. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  if (el.isContentEditable) return true
  return !!el.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]')
}

/**
 * For single-key shortcuts: typing in a field, a modifier held, or anything
 * inside a dialog is never a shortcut. Same rules the KTIP calendar has
 * always used, now shared.
 */
export function shouldIgnoreSingleKey(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true
  if (isEditableTarget(e.target)) return true
  return Boolean((e.target as HTMLElement | null)?.closest?.('[role="dialog"]'))
}

/**
 * Two-key sequences, "g" then a letter. Returns the second key when a sequence
 * completes, else null. A gap longer than timeoutMs starts over.
 */
export function createSequence(prefix = 'g', timeoutMs = 1200, now: () => number = Date.now) {
  let armedAt = -Infinity
  return {
    feed(key: string): string | null {
      const t = now()
      if (t - armedAt <= timeoutMs) {
        armedAt = -Infinity
        return key.toLowerCase()
      }
      if (key.toLowerCase() === prefix) armedAt = t
      return null
    },
    get armed() {
      return now() - armedAt <= timeoutMs
    },
  }
}
