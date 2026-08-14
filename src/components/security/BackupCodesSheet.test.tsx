import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BackupCodesSheet } from './BackupCodesSheet'

afterEach(cleanup)

const CODES = [
  'ABCDE12345',
  'FGHJK67890',
  'MNPQR11111',
  'STVWX22222',
  'YZ01234567',
  'A1B2C3D4E5',
  'F6G7H8J9K0',
  'MNPQRSTVWX',
  'YZ98765432',
  'K5M6N7P8Q9',
]

describe('BackupCodesSheet', () => {
  it('renders every code in display form', () => {
    render(<BackupCodesSheet codes={CODES} confirmLabel="Finish" onConfirm={vi.fn()} />)
    expect(screen.getByText('ABCDE-12345')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
  })

  it('gates the confirm button on the acknowledgement', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<BackupCodesSheet codes={CODES} confirmLabel="Finish" onConfirm={onConfirm} />)

    const finish = screen.getByRole('button', { name: 'Finish' }) as HTMLButtonElement
    // Blocking two-factor with an un-acknowledged recovery path is a lockout
    // generator. This checkbox is the only moment we can make someone stop.
    expect(finish.disabled).toBe(true)

    await user.click(screen.getByRole('checkbox'))
    expect(finish.disabled).toBe(false)

    await user.click(finish)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('downloads a file holding all ten codes', async () => {
    const user = userEvent.setup()
    let downloaded = ''
    const createObjectURL = vi.fn((blob: Blob) => {
      // jsdom has no Blob.text() timing guarantees inside the click handler, so
      // the content is captured here where the Blob is still in hand.
      void blob.text().then((text) => {
        downloaded = text
      })
      return 'blob:mock'
    })
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })

    render(<BackupCodesSheet codes={CODES} confirmLabel="Finish" onConfirm={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /download/i }))
    await vi.waitFor(() => expect(downloaded).not.toBe(''))

    for (const code of CODES) {
      expect(downloaded).toContain(
        `${code.slice(0, 5)}-${code.slice(5)}`,
      )
    }
    vi.unstubAllGlobals()
  })
})
