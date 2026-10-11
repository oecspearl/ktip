import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createA11yStore } from '../core/store'
import { A11yProvider } from '../react/A11yProvider'
import { AccessibilityControls } from '../react/AccessibilityControls'
import { AccessibilityPanel } from '../react/AccessibilityPanel'
import type { ThemeAdapter } from '../react/context'

// Explicit: auto-cleanup needs vitest globals, which a host may not enable
afterEach(cleanup)

function setup(ui: 'controls' | 'panel' = 'controls', onClose = () => {}) {
  const data: Record<string, string> = {}
  const store = createA11yStore(
    { storageKey: 'ctl', fonts: [{ id: 'lexend', label: 'Lexend' }] },
    {
      storage: { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) },
      root: document.createElement('html'),
    }
  )
  let mode: 'light' | 'dark' = 'light'
  const listeners = new Set<() => void>()
  const theme: ThemeAdapter = {
    get: () => mode,
    set: (m) => {
      mode = m
      listeners.forEach((l) => l())
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
  render(
    <A11yProvider store={store} theme={theme}>
      {ui === 'controls' ? <AccessibilityControls /> : <AccessibilityPanel onClose={onClose} />}
    </A11yProvider>
  )
  return { store, theme: () => mode }
}

describe('AccessibilityControls', () => {
  it('steps text size with labelled buttons and announces the value', () => {
    const { store } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Increase Text size' }))
    expect(store.getSettings().fontScale).toBe(1.05)
    expect(screen.getAllByText('105%').length).toBeGreaterThan(0)
  })

  it('counts every press, however fast', () => {
    const { store } = setup()
    const more = screen.getByRole('button', { name: 'Increase Text size' })
    fireEvent.click(more)
    fireEvent.click(more)
    fireEvent.click(more)
    fireEvent.click(more)
    expect(store.getSettings().fontScale).toBe(1.2)
  })

  it('exposes every toggle as a named switch', () => {
    const { store } = setup()
    const sw = screen.getByRole('switch', { name: 'Underline links' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(store.getSettings().underlineLinks).toBe(true)
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('moves a radiogroup with the arrow keys, one tab stop', () => {
    const { store } = setup()
    const group = screen.getByRole('radiogroup', { name: 'Contrast' })
    const radios = Array.from(group.querySelectorAll('[role="radio"]'))
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(store.getSettings().contrast).toBe('standard')
    fireEvent.keyDown(group, { key: 'End' })
    expect(store.getSettings().contrast).toBe('more')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(store.getSettings().contrast).toBe('auto')
  })

  it("drives the host's theme", () => {
    const { theme } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(theme()).toBe('dark')
  })

  it('resets one section without touching another', () => {
    const { store } = setup()
    act(() => store.patch({ fontScale: 1.3, reduceMotion: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset Text' }))
    expect(store.getSettings().fontScale).toBe(1)
    expect(store.getSettings().reduceMotion).toBe(true)
  })
})

describe('AccessibilityPanel', () => {
  it('is a labelled dialog that focuses its first control and closes on Escape', () => {
    let closed = 0
    setup('panel', () => closed++)
    const dialog = screen.getByRole('dialog', { name: 'Accessibility' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(closed).toBe(1)
  })

  it('resets everything but keeps the setup record', () => {
    const { store } = setup('panel')
    act(() => store.patch({ fontScale: 1.4, setup: { status: 'kept', at: '2026-10-11T00:00:00Z' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }))
    expect(store.getSettings().fontScale).toBe(1)
    expect(store.getSettings().setup?.status).toBe('kept')
  })
})
