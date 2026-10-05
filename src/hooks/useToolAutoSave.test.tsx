import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToolAutoSave } from './useToolAutoSave'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('useToolAutoSave', () => {
  it('never runs two saves at once, and runs one more pass for edits made mid-save', async () => {
    const gates: Array<ReturnType<typeof deferred>> = []
    let running = 0
    let maxRunning = 0
    const save = vi.fn(async () => {
      running++
      maxRunning = Math.max(maxRunning, running)
      const gate = deferred()
      gates.push(gate)
      await gate.promise
      running--
    })

    const { result } = renderHook(() => useToolAutoSave({ save }))

    let first!: Promise<void>
    let second!: Promise<void>
    let third!: Promise<void>
    act(() => {
      first = result.current.saveNow()
      second = result.current.saveNow()
      third = result.current.saveNow()
    })

    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => {
      gates[0].resolve()
      await Promise.resolve()
    })
    // The three requests collapse into the running save plus one follow-up.
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))

    await act(async () => {
      gates[1].resolve()
      await Promise.all([first, second, third])
    })

    expect(save).toHaveBeenCalledTimes(2)
    expect(maxRunning).toBe(1)
    expect(result.current.status).toBe('saved')
  })

  it('lets a later save see what the first one wrote to the caller ref', async () => {
    const idRef = { current: null as string | null }
    const inserts: string[] = []
    const updates: string[] = []
    const gate = deferred()
    const save = vi.fn(async () => {
      if (idRef.current) {
        updates.push(idRef.current)
        return
      }
      await gate.promise
      inserts.push('row-1')
      idRef.current = 'row-1'
    })

    const { result } = renderHook(() => useToolAutoSave({ save }))

    let a!: Promise<void>
    let b!: Promise<void>
    act(() => {
      a = result.current.saveNow()
      b = result.current.saveNow()
    })
    await act(async () => {
      gate.resolve()
      await Promise.all([a, b])
    })

    expect(inserts).toEqual(['row-1'])
    expect(updates).toEqual(['row-1'])
  })
})
