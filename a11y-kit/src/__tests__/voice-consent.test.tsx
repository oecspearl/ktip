import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { request } from '../core/events'
import { createA11yStore } from '../core/store'
import { A11yProvider } from '../react/A11yProvider'

afterEach(cleanup)

// The dialogs and controller are lazy chunks; a loaded test run can take
// longer than the 1s default to fetch them, hence the 5s waits below.
// Recognition must exist for the voice layer to mount at all
class FakeRecognition extends EventTarget {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult = null
  onerror = null
  onend: (() => void) | null = null
  start() {}
  stop() {
    this.onend?.()
  }
  abort() {}
}
beforeEach(() => {
  ;(window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition
})
afterEach(() => {
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
})

function mount(device: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) {
  const data: Record<string, string> = {
    vc: JSON.stringify({ v: 2, updatedAt: 1, owner: null, settings, device }),
  }
  const store = createA11yStore(
    { storageKey: 'vc' },
    { storage: { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }, root: document.createElement('html') }
  )
  render(<A11yProvider store={store}>{null}</A11yProvider>)
  return store
}

describe('voice consent', () => {
  it('asks before the first listen, and records the answer on this device only', async () => {
    const store = mount()
    await act(async () => request('voice'))
    const yes = await screen.findByRole('button', { name: 'Turn on' }, { timeout: 5000 })
    await act(async () => fireEvent.click(yes))
    expect(store.getState().device.voiceConsentAt).toEqual(expect.any(String))
    expect(store.getSettings().voiceNav).toBe(true)
    // Consent is device state: it never travels in the synced settings
    expect(JSON.stringify(store.getSettings())).not.toContain('voiceConsentAt')
  })

  it('does nothing on "Not now"', async () => {
    const store = mount()
    await act(async () => request('voice'))
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Not now' }, { timeout: 5000 })))
    expect(store.getState().device.voiceConsentAt).toBeNull()
    expect(store.getSettings().voiceNav).toBe(false)
  })

  it('never listens on a device that has not agreed, even with the setting synced on', async () => {
    mount({}, { voiceNav: true })
    await act(async () => {})
    expect(document.querySelector('.ak-voice')).toBeNull()
  })

  it('shows the microphone once agreed', async () => {
    mount({ voiceConsentAt: '2026-10-11T00:00:00Z' }, { voiceNav: true })
    expect(await screen.findByRole('button', { name: 'Speak a command' }, { timeout: 5000 })).toBeTruthy()
  })
})
