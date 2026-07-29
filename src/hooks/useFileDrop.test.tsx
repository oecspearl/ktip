import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useFileDrop } from './useFileDrop'

afterEach(cleanup)

function fileOf(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

function Zone(props: {
  onFiles: (files: File[]) => void
  accept?: readonly string[]
  multiple?: boolean
  disabled?: boolean
}) {
  const { isDragging, dropProps } = useFileDrop(props)
  return (
    <div data-testid="zone" {...dropProps}>
      <span data-testid="state">{isDragging ? 'dragging' : 'idle'}</span>
      <span data-testid="child">child</span>
    </div>
  )
}

/** fireEvent.drop/dragEnter don't attach dataTransfer, so pass one explicitly. */
function transferWith(files: File[]) {
  return { files, items: files.map((f) => ({ kind: 'file', type: f.type })), types: ['Files'] }
}

describe('useFileDrop', () => {
  it('stays dragging while the pointer crosses child elements', () => {
    render(<Zone onFiles={vi.fn()} />)
    const zone = screen.getByTestId('zone')

    fireEvent.dragEnter(zone)
    expect(screen.getByTestId('state').textContent).toBe('dragging')

    // Entering a child fires enter-on-child then leave-on-parent; a plain
    // boolean would flicker back to idle here.
    fireEvent.dragEnter(screen.getByTestId('child'))
    fireEvent.dragLeave(zone)
    expect(screen.getByTestId('state').textContent).toBe('dragging')

    fireEvent.dragLeave(zone)
    expect(screen.getByTestId('state').textContent).toBe('idle')
  })

  it('passes dropped files through and clears the dragging state', () => {
    const onFiles = vi.fn()
    render(<Zone onFiles={onFiles} />)
    const zone = screen.getByTestId('zone')

    fireEvent.dragEnter(zone)
    fireEvent.drop(zone, { dataTransfer: transferWith([fileOf('a.jpg', 'image/jpeg')]) })

    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.jpg'])
    expect(screen.getByTestId('state').textContent).toBe('idle')
  })

  it('filters by accept, including wildcards', () => {
    const onFiles = vi.fn()
    render(<Zone onFiles={onFiles} accept={['image/*']} multiple />)

    fireEvent.drop(screen.getByTestId('zone'), {
      dataTransfer: transferWith([
        fileOf('a.jpg', 'image/jpeg'),
        fileOf('notes.txt', 'text/plain'),
        fileOf('b.png', 'image/png'),
      ]),
    })

    expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.jpg', 'b.png'])
  })

  it('does not fire when nothing matches accept', () => {
    const onFiles = vi.fn()
    render(<Zone onFiles={onFiles} accept={['image/*']} />)

    fireEvent.drop(screen.getByTestId('zone'), {
      dataTransfer: transferWith([fileOf('notes.txt', 'text/plain')]),
    })

    expect(onFiles).not.toHaveBeenCalled()
  })

  it('passes only the first file when multiple is false', () => {
    const onFiles = vi.fn()
    render(<Zone onFiles={onFiles} />)

    fireEvent.drop(screen.getByTestId('zone'), {
      dataTransfer: transferWith([fileOf('a.jpg', 'image/jpeg'), fileOf('b.jpg', 'image/jpeg')]),
    })

    expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.jpg'])
  })

  it('ignores drags while disabled', () => {
    const onFiles = vi.fn()
    render(<Zone onFiles={onFiles} disabled />)
    const zone = screen.getByTestId('zone')

    fireEvent.dragEnter(zone)
    expect(screen.getByTestId('state').textContent).toBe('idle')

    fireEvent.drop(zone, { dataTransfer: transferWith([fileOf('a.jpg', 'image/jpeg')]) })
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('prevents the browser default on dragover so the drop can fire', () => {
    render(<Zone onFiles={vi.fn()} />)
    const handled = fireEvent.dragOver(screen.getByTestId('zone'), {
      dataTransfer: transferWith([]),
    })
    // fireEvent returns false when preventDefault was called.
    expect(handled).toBe(false)
  })
})
