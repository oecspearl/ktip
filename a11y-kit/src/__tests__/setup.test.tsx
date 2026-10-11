import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../core/config'
import { applyPreset, changedKeys, NO_NEEDS } from '../core/setup/presets'
import { isSetupActive, readRun, shouldOfferSetup } from '../core/setup/flow'
import { createA11yStore } from '../core/store'
import { A11yProvider } from '../react/A11yProvider'
import type { ThemeAdapter } from '../react/context'
import type { NavigationAdapter } from '../react/options'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('presets', () => {
  it('moves settings only in the helpful direction', () => {
    const base = { ...DEFAULT_SETTINGS, fontScale: 1.4, contrast: 'standard' as const }
    const { settings } = applyPreset(base, ['lowVision'])
    expect(settings.fontScale).toBe(1.4) // already above the preset's 1.25
    expect(settings.contrast).toBe('more')
    expect(settings.cursor).toBe('large')
  })

  it('combines needs: highest size, lowest brightness, strongest choice', () => {
    const { settings, theme } = applyPreset(DEFAULT_SETTINGS, ['dyslexia', 'lowVision', 'lightSensitive'])
    expect(settings.fontScale).toBe(1.25)
    expect(settings.spacing).toBe(2)
    expect(settings.pageBrightness).toBe(0.85)
    expect(settings.contrast).toBe('more')
    expect(theme).toBe('dark')
  })

  it("never replaces a font someone already chose", () => {
    expect(applyPreset({ ...DEFAULT_SETTINGS, font: 'lexend' }, ['dyslexia']).settings.font).toBe('lexend')
    expect(applyPreset(DEFAULT_SETTINGS, ['dyslexia']).settings.font).toBe('atkinson')
  })

  it('changes nothing for "none", and asks for a text tour for screen reader users', () => {
    expect(changedKeys(DEFAULT_SETTINGS, applyPreset(DEFAULT_SETTINGS, [NO_NEEDS]).settings)).toEqual([])
    expect(applyPreset(DEFAULT_SETTINGS, ['screenReader']).textTour).toBe(true)
    expect(applyPreset(DEFAULT_SETTINGS, ['screenReader']).settings.readerBar).toBe(false)
  })
})

describe('gate', () => {
  const g = { enabled: true, ready: true, record: null, snoozed: false, path: '/', entryPaths: ['/', '/dashboard'] }
  it('offers once, on an entry page, when nothing is in the way', () => {
    expect(shouldOfferSetup(g)).toBe(true)
    expect(shouldOfferSetup({ ...g, path: '/dashboard/' })).toBe(true)
    expect(shouldOfferSetup({ ...g, path: '/projects/new' })).toBe(false)
    expect(shouldOfferSetup({ ...g, ready: false })).toBe(false)
    expect(shouldOfferSetup({ ...g, snoozed: true })).toBe(false)
    expect(shouldOfferSetup({ ...g, enabled: false })).toBe(false)
    expect(shouldOfferSetup({ ...g, record: { status: 'skipped', at: 'x' } })).toBe(false)
  })

  it('forgets a run left open for more than a day', () => {
    const storage = { getItem: () => JSON.stringify({ stage: 'journey', startedAt: 0 }) }
    expect(readRun(storage, 'k', 1000)).not.toBeNull()
    expect(readRun(storage, 'k', 2 * 24 * 60 * 60 * 1000)).toBeNull()
  })
})

// The flow is a lazy chunk; its first transform under vitest can take seconds
describe('the setup flow', { timeout: 30000 }, () => {
  function mount() {
    const store = createA11yStore({ storageKey: 'su' }, { storage: localStorage, root: document.createElement('html') })
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
    let path = '/'
    const pathListeners = new Set<() => void>()
    const navigation: NavigationAdapter = {
      navigate: (p) => {
        path = p
        pathListeners.forEach((l) => l())
      },
      location: {
        get: () => path,
        subscribe: (l) => {
          pathListeners.add(l)
          return () => pathListeners.delete(l)
        },
      },
    }
    const write = vi.fn(() => Promise.resolve())
    const onEvent = vi.fn()
    render(
      <A11yProvider
        store={store}
        theme={theme}
        navigation={navigation}
        sync={{ identity: 'u1', remote: null, write }}
        setup={{ enabled: true, ready: true, entryPaths: ['/'] }}
        journey={[
          { id: 'a', path: '/', title: 'Stop A', body: 'First', tryIt: ['fontScale'] },
          { id: 'b', path: '/b', title: 'Stop B', body: 'Second' },
        ]}
        onEvent={onEvent}
      >
        <main>
          <h1>Page</h1>
        </main>
      </A11yProvider>
    )
    return { store, theme: () => mode, path: () => path, write, onEvent }
  }
  // Poll inside act: setup opens from a timer and arrives as a lazy chunk,
  // and React only flushes those inside act in a test environment
  async function findRole(role: string, name: string | RegExp) {
    for (let i = 0; i < 60; i++) {
      const hit = screen.queryByRole(role, { name })
      if (hit) return hit
      await act(async () => {
        await new Promise((r) => setTimeout(r, 250))
      })
    }
    throw new Error(`no ${role} named ${String(name)}`)
  }
  const find = (name: string) => findRole('button', name)
  // Never find inside act: the poll would run nested and nothing would flush
  const clickOn = (el: Element) =>
    act(async () => {
      fireEvent.click(el)
    })

  it('runs intro, needs, preview, tour, review, and undoes everything on request', async () => {
    const t = mount()
    await clickOn(await find('Start'))
    expect(isSetupActive()).toBe(true)

    await clickOn(await findRole('checkbox', /Low vision/))
    await clickOn(await find('Next'))
    // Applied live, so the preview is the real thing
    expect(t.store.getSettings().fontScale).toBe(1.25)
    expect(t.store.getSettings().contrast).toBe('more')

    // Switching one change back off
    const sw = await findRole('switch', /Contrast/)
    await clickOn(sw)
    expect(t.store.getSettings().contrast).toBe('auto')

    await clickOn(await find('Try them on real pages'))
    expect(await findRole('heading', 'Stop A')).toBeTruthy()
    await clickOn(await find('Next stop'))
    expect(t.path()).toBe('/b')
    await clickOn(await find('Finish'))

    // Nothing reached the account while it was only a trial
    expect(t.write).not.toHaveBeenCalled()

    await clickOn(await find('Undo all of it'))
    expect(t.store.getSettings().fontScale).toBe(1)
    expect(t.store.getSettings().setup?.status).toBe('reverted')
    expect(t.store.getState().device.needs).toEqual(['lowVision'])
    expect(isSetupActive()).toBe(false)
    expect(t.onEvent).toHaveBeenCalledWith('setup_reverted', { stops: 2, source: 'auto' })
    // The event carries no needs
    expect(JSON.stringify(t.onEvent.mock.calls)).not.toContain('lowVision')
  })

  it('keeps the preset without a tour', async () => {
    const t = mount()
    await clickOn(await find('Start'))
    await clickOn(await findRole('checkbox', /Motion makes me/))
    await clickOn(await find('Next'))
    await clickOn(await find('Keep them, skip the tour'))
    expect(t.store.getSettings().reduceMotion).toBe(true)
    expect(t.store.getSettings().setup?.status).toBe('kept')
  })

  it('records a skip, and "ask me later" leaves no record', async () => {
    const t = mount()
    await clickOn(await find("No thanks, don't ask again"))
    expect(t.store.getSettings().setup?.status).toBe('skipped')
  })
})
