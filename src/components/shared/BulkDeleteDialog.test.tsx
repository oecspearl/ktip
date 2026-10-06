import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { BulkDeleteDialog } from './BulkDeleteDialog'
import { describeProjectDeletion, type BulkDeleteItem } from '../../lib/delete-guard'
import { useSelection } from '../../hooks/useSelection'

const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => toast }))

const item = (id: string, isPublic = false): BulkDeleteItem => ({
  id,
  title: `Project ${id}`,
  impact: describeProjectDeletion({ isPublic, memberCount: 0 }),
})

function renderDialog(items: BulkDeleteItem[] | null, onDelete = vi.fn()) {
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <BulkDeleteDialog
      open
      kind="project"
      items={items}
      onClose={onClose}
      onDelete={onDelete}
      onDeleted={onDeleted}
    />
  )
  return { onClose, onDeleted, onDelete }
}

const confirmButton = () => screen.getByRole('button', { name: /Delete \d+ project/ })

describe('BulkDeleteDialog', () => {
  it('holds the delete while the impact is still loading', () => {
    renderDialog(null)
    expect(confirmButton()).toBeDisabled()
  })

  it('deletes private drafts on a plain confirm and closes', async () => {
    const onDelete = vi.fn().mockResolvedValue({ done: ['a', 'b'], failed: [] })
    const { onClose, onDeleted } = renderDialog([item('a'), item('b')], onDelete)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(confirmButton())

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onDelete.mock.calls[0][0]).toEqual(['a', 'b'])
    expect(onDeleted).toHaveBeenCalledWith(['a', 'b'])
    expect(toast.success).toHaveBeenCalled()
  })

  it('asks for the count when one of several is public', () => {
    renderDialog([item('a', true), item('b'), item('c')])

    expect(confirmButton()).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '2' } })
    expect(confirmButton()).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '3' } })
    expect(confirmButton()).toBeEnabled()
  })

  it('reports the rows that did not go, and keeps the dialog open', async () => {
    const onDelete = vi.fn().mockResolvedValue({
      done: ['a'],
      failed: [{ item: 'b', message: 'permission denied' }],
    })
    const { onClose, onDeleted } = renderDialog([item('a'), item('b')], onDelete)

    fireEvent.click(confirmButton())

    // "Project b" is already on screen in the pre-delete list, so wait on the
    // report itself; finding the title first returns a node about to be replaced.
    expect(await screen.findByText('Some could not be deleted')).toBeInTheDocument()
    expect(screen.getByText('Project b')).toBeInTheDocument()
    expect(screen.queryByText('Project a')).not.toBeInTheDocument()
    expect(screen.getByText('permission denied')).toBeInTheDocument()
    expect(onDeleted).toHaveBeenCalledWith(['a'])
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('useSelection', () => {
  it('only counts rows that are still on screen', () => {
    const { result, rerender } = renderHook(({ ids }) => useSelection(ids), {
      initialProps: { ids: ['a', 'b', 'c'] },
    })

    act(() => result.current.toggle('a'))
    act(() => result.current.toggle('c'))
    expect(result.current.selectedIds).toEqual(['a', 'c'])

    // A filter hides "c": it stops counting, but comes back with the filter.
    rerender({ ids: ['a', 'b'] })
    expect(result.current.selectedIds).toEqual(['a'])
    rerender({ ids: ['a', 'b', 'c'] })
    expect(result.current.selectedIds).toEqual(['a', 'c'])
  })

  it('selects every visible row and clears them all', () => {
    const { result } = renderHook(() => useSelection(['a', 'b']))

    act(() => result.current.selectAll())
    expect(result.current.allSelected).toBe(true)
    expect(result.current.count).toBe(2)

    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
  })
})
