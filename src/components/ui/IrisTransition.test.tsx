import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act, render, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { IrisTransitionProvider, useIrisTransition } from './IrisTransition'

/**
 * The one promise this overlay makes is that it never stays up. These cover
 * the ways it could: a normal move, work that fails, and work that never
 * finishes at all.
 */

let api: ReturnType<typeof useIrisTransition> | null = null

function Grab() {
  api = useIrisTransition()
  return null
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/map']}>
      <IrisTransitionProvider>
        <Grab />
        <Routes>
          <Route path="/map" element={<p>map</p>} />
          <Route path="/room" element={<p>room</p>} />
        </Routes>
      </IrisTransitionProvider>
    </MemoryRouter>
  )
}

const overlay = () => document.querySelector('.iris-cutout')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  api = null
})

describe('IrisTransitionProvider', () => {
  it('shuts, changes the route, and clears', async () => {
    const view = mount()
    let done: Promise<void> | undefined
    act(() => {
      done = api!.navigate('/room')
    })
    expect(overlay()?.getAttribute('data-phase')).toBe('closing')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    await act(async () => {
      await done
    })
    expect(view.getByText('room')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(overlay()).toBeNull()
  })

  it('opens again when the work in between fails', async () => {
    mount()
    await act(async () => {
      const shut = api!.close()
      await vi.advanceTimersByTimeAsync(400)
      await shut
      api!.open()
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(overlay()).toBeNull()
  })

  it('stays shut while a page holds it, and opens when the page lets go', async () => {
    mount()
    let release = () => {}
    await act(async () => {
      const shut = api!.close()
      await vi.advanceTimersByTimeAsync(400)
      await shut
      release = api!.hold()
      api!.open()
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(overlay()?.getAttribute('data-phase')).toBe('closed')
    await act(async () => {
      release()
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(overlay()).toBeNull()
  })

  it('opens after four seconds even if a page never lets go', async () => {
    mount()
    await act(async () => {
      const shut = api!.close()
      await vi.advanceTimersByTimeAsync(400)
      await shut
      api!.hold()
      api!.open()
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(overlay()).toBeNull()
  })

  it('opens on its own if nobody ever asks it to', async () => {
    mount()
    await act(async () => {
      void api!.close()
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(overlay()?.getAttribute('data-phase')).toBe('closed')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(overlay()).toBeNull()
  })
})
