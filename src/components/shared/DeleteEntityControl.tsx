import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Trash2 } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { DeleteEntityDialog } from './DeleteEntityDialog'
import type { DeleteImpact } from '../../lib/delete-guard'

interface DeleteEntityControlProps {
  /** Lower-case singular: "event", "project". */
  noun: string
  title: string
  impact: DeleteImpact
  /** Awaited. Rejecting leaves the dialog open with the message shown. */
  onDelete: () => Promise<void>
  /**
   * Where to land once the row is gone, for surfaces that *are* the row — a
   * detail or edit page cannot stay open on a deleted record. Omit on a list
   * or table, which just loses a row.
   */
  redirectTo?: string
  /** Called after a successful delete. Use to refetch a list. */
  onDeleted?: () => void
  /**
   * `'button'` for a compact trigger beside Edit; `'zone'` for the full
   * bordered panel at the bottom of an edit form; `'icon'` for a table row.
   */
  variant?: 'button' | 'zone' | 'icon'
  zoneDescription?: string
}

/**
 * Trigger plus confirm dialog plus the delete call itself, so a page only has
 * to supply the impact and the mutation. Both surfaces that can delete a row
 * (the detail page and the edit page) mount this, which is what stops them
 * drifting apart on friction or copy.
 */
export function DeleteEntityControl({
  noun,
  title,
  impact,
  onDelete,
  redirectTo,
  onDeleted,
  variant,
  zoneDescription,
}: DeleteEntityControlProps) {
  const navigate = useNavigate()
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
      toast.success(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} deleted`)
      setOpen(false)
      onDeleted?.()
      if (redirectTo) navigate(redirectTo, { replace: true })
    } catch (err: any) {
      // Almost always an RLS refusal: the delete policy checks ownership, so a
      // stale page or a revoked role lands here rather than silently no-opping.
      setError(err?.message || `Could not delete this ${noun}. You may no longer own it.`)
    } finally {
      setDeleting(false)
    }
  }

  const dialog = (
    <DeleteEntityDialog
      open={open}
      noun={noun}
      title={title}
      impact={impact}
      loading={deleting}
      error={error}
      onCancel={() => {
        setOpen(false)
        setError(null)
      }}
      onConfirm={handleConfirm}
    />
  )

  if (variant === 'zone') {
    return (
      <>
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-red-800">
            Danger zone
          </h3>
          <p className="mt-2 text-sm text-red-700">
            {zoneDescription ||
              `Deleting this ${noun} is permanent. Everything attached to it is removed with it and cannot be restored.`}
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-ktip-cream px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-600 hover:text-white"
          >
            <Trash2 size={14} />
            Delete this {noun}
          </button>
        </div>
        {dialog}
      </>
    )
  }

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={deleting}
          className="p-1.5 text-gray-400 transition-colors hover:text-red-600 disabled:opacity-50"
          title={`Delete ${noun}`}
        >
          <Trash2 size={16} />
        </button>
        {dialog}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
      >
        <Trash2 size={14} />
        Delete
      </button>
      {dialog}
    </>
  )
}
