import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import {
  DEFAULT_CHORDS,
  RESERVED_CHORDS,
  chordLabel,
  createSequence,
  matchChord,
  routeChord,
  sameChord,
  shouldIgnoreSingleKey,
} from '../core/shortcuts'
import { onRequest } from '../core/events'
import { createA11yStore } from '../core/store'
import { A11yProvider } from '../react/A11yProvider'
import type { NavigationAdapter } from '../react/options'

afterEach(cleanup)

const key = (code: string, mods: Partial<Record<'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) => ({
  code,
  altKey: false,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
})

describe('chords', () => {
  it('match on the physical key and the exact modifiers', () => {
    const c = DEFAULT_CHORDS.main
    expect(matchChord(key('KeyC', { altKey: true, shiftKey: true }), c)).toBe(true)
    expect(matchChord(key('KeyC', { altKey: true }), c)).toBe(false)
    expect(matchChord(key('KeyC', { altKey: true, shiftKey: true, ctrlKey: true }), c)).toBe(false)
  })

  it('treat numpad digits as the digit row', () => {
    expect(matchChord(key('Numpad3', { altKey: true, shiftKey: true }), routeChord(3))).toBe(true)
  })

  it('never use a chord the browser or OS owns, and never share one', () => {
    const all = Object.values(DEFAULT_CHORDS)
    for (const { chord, owner } of RESERVED_CHORDS) expect(all.some((c) => sameChord(c, chord)), owner).toBe(false)
    expect(new Set(all.map((c) => JSON.stringify(c))).size).toBe(all.length)
  })

  it('label for Windows and Mac', () => {
    expect(chordLabel(DEFAULT_CHORDS.textUp, false)).toBe('Alt+Shift+=')
    expect(chordLabel(DEFAULT_CHORDS.main, true)).toBe('⌥⇧C')
  })
})

describe('sequences', () => {
  it('complete within the timeout and reset after it', () => {
    let t = 0
    const seq = createSequence('g', 1000, () => t)
    expect(seq.feed('g')).toBeNull()
    t = 500
    expect(seq.feed('p')).toBe('p')
    expect(seq.feed('p')).toBeNull()
    seq.feed('g')
    t = 3000
    expect(seq.feed('p')).toBeNull()
  })
})

describe('shouldIgnoreSingleKey', () => {
  it('ignores typing, modifiers and dialogs', () => {
    const input = document.createElement('input')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const inDialog = document.createElement('button')
    dialog.appendChild(inDialog)
    document.body.append(input, dialog)
    const ev = (target: EventTarget, mods = {}) => ({ target, metaKey: false, ctrlKey: false, altKey: false, ...mods }) as unknown as KeyboardEvent
    expect(shouldIgnoreSingleKey(ev(input))).toBe(true)
    expect(shouldIgnoreSingleKey(ev(inDialog))).toBe(true)
    expect(shouldIgnoreSingleKey(ev(document.body, { ctrlKey: true }))).toBe(true)
    expect(shouldIgnoreSingleKey(ev(document.body))).toBe(false)
    input.remove()
    dialog.remove()
  })
})

describe('Runtime', () => {
  function mount(mode: 'off' | 'modifier' | 'all' = 'modifier', isBlocked?: () => boolean) {
    const data: Record<string, string> = {}
    const store = createA11yStore(
      { storageKey: 'rt' },
      { storage: { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }, root: document.createElement('html') }
    )
    store.patch({ shortcuts: mode })
    const navigate = vi.fn()
    const navigation: NavigationAdapter = { navigate, location: { get: () => '/', subscribe: () => () => {} } }
    render(
      <A11yProvider
        store={store}
        navigation={navigation}
        isBlocked={isBlocked}
        routes={[
          { id: 'home', path: '/', label: 'Home', digit: 1, seq: 'h' },
          { id: 'projects', path: '/projects', label: 'Projects', digit: 2, seq: 'p' },
        ]}
      >
        <main>
          <h1>Title</h1>
          <input aria-label="field" />
        </main>
      </A11yProvider>
    )
    return { store, navigate }
  }
  const press = (code: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
    act(() => {
      fireEvent.keyDown(target, { code, key: init.key ?? '', bubbles: true, ...init })
    })

  it('goes to a page on Alt+Shift+digit', () => {
    const { navigate } = mount()
    press('Digit2', { altKey: true, shiftKey: true })
    expect(navigate).toHaveBeenCalledWith('/projects')
  })

  it('changes text size and asks for the panel', () => {
    const { store } = mount()
    const panel = vi.fn()
    const off = onRequest('panel', panel)
    press('Equal', { altKey: true, shiftKey: true })
    expect(store.getSettings().fontScale).toBe(1.05)
    press('Digit0', { altKey: true, shiftKey: true })
    expect(store.getSettings().fontScale).toBe(1)
    press('KeyA', { altKey: true, shiftKey: true })
    expect(panel).toHaveBeenCalledTimes(1)
    off()
  })

  it('leaves single keys alone unless switched on, and never while typing', () => {
    const { navigate } = mount('modifier')
    press('KeyG', { key: 'g' })
    press('KeyP', { key: 'p' })
    expect(navigate).not.toHaveBeenCalled()
    cleanup()

    const all = mount('all')
    const field = document.querySelector('input')!
    press('KeyG', { key: 'g' }, field)
    press('KeyP', { key: 'p' }, field)
    expect(all.navigate).not.toHaveBeenCalled()
    press('KeyG', { key: 'g' })
    press('KeyP', { key: 'p' })
    expect(all.navigate).toHaveBeenCalledWith('/projects')
  })

  it('stands down entirely when off', () => {
    const off = mount('off')
    press('Digit2', { altKey: true, shiftKey: true })
    expect(off.navigate).not.toHaveBeenCalled()
  })

  it('pauses single keys, not chords, while something else owns the plain keys', () => {
    const blocked = mount('all', () => true)
    press('KeyG', { key: 'g' })
    press('KeyP', { key: 'p' })
    expect(blocked.navigate).not.toHaveBeenCalled()
    press('Digit2', { altKey: true, shiftKey: true })
    expect(blocked.navigate).toHaveBeenCalledWith('/projects')
  })

  it('stands down for a modal dialog', () => {
    const { navigate } = mount()
    const d = document.createElement('div')
    d.setAttribute('aria-modal', 'true')
    document.body.appendChild(d)
    press('Digit2', { altKey: true, shiftKey: true })
    expect(navigate).not.toHaveBeenCalled()
    d.remove()
  })
})
