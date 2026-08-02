import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X } from 'lucide-react'
import {
  headerColor,
  NOTE_TEXT_COLOR,
  type StickyGroupRecord,
  type StickyNoteRecord,
} from '../../lib/sticky-notes'
import type { StickyGroupPatch } from '../../hooks/useStickyNotes'

/** Strips the stored HTML back to a line of text for the card preview. Uses
 *  the parser rather than a regex — a regex over HTML gets `<b>a<b>` wrong in
 *  ways that show up as stray angle brackets in the grid. */
function preview(html: string, max = 70): string {
  const el = document.createElement('div')
  el.innerHTML = html
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

interface StickyNoteGroupExpandedProps {
  group: StickyGroupRecord
  members: StickyNoteRecord[]
  onClose: () => void
  onCommit: (patch: StickyGroupPatch) => void
  /** Takes a note out of the folder and puts it on screen */
  onPopOut: (noteId: string) => void
  onAddNote: () => void
  onDissolve: (deleteNotes: boolean) => void
}

/**
 * The inside of a folder: a grid of the notes it holds. Clicking one takes it
 * out and opens it, which is the only way back to a filed note — a preview you
 * can read but not edit would be a dead end.
 */
export function StickyNoteGroupExpanded({
  group,
  members,
  onClose,
  onCommit,
  onPopOut,
  onAddNote,
  onDissolve,
}: StickyNoteGroupExpandedProps) {
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(group.title)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const commitTitle = () => {
    setRenaming(false)
    const next = title.trim()
    if (next && next !== group.title) onCommit({ title: next })
    else setTitle(group.title)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${group.title} folder`}
        className="w-full max-w-lg max-h-[70vh] overflow-hidden rounded-2xl shadow-hard animate-scale-in flex flex-col"
        style={{ background: group.color, color: NOTE_TEXT_COLOR }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ background: headerColor(group.color) }}
        >
          {renaming ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') {
                  setTitle(group.title)
                  setRenaming(false)
                }
              }}
              aria-label="Folder name"
              className="flex-1 rounded bg-white/60 px-2 py-1 text-base font-bold outline-none"
            />
          ) : (
            <button
              type="button"
              onDoubleClick={() => setRenaming(true)}
              onClick={() => setRenaming(true)}
              title="Rename folder"
              className="flex-1 truncate text-left text-base font-bold hover:underline"
            >
              {group.title}
            </button>
          )}
          <span className="text-xs opacity-70">{members.length} notes</span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-black/10"
          >
            Ungroup
          </button>
          <button
            type="button"
            aria-label="Close folder"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-black/10"
          >
            <X size={18} />
          </button>
        </div>

        {confirming ? (
          <div className="p-6">
            <p className="text-sm font-semibold">Ungroup this folder?</p>
            <p className="mt-1 text-sm opacity-75">
              Keeping the notes puts all {members.length} back on the page. Deleting removes them
              for good.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg px-3 py-1.5 text-sm hover:bg-black/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onDissolve(false)}
                className="rounded-lg bg-white/70 px-3 py-1.5 text-sm font-medium hover:bg-white"
              >
                Keep notes
              </button>
              <button
                type="button"
                onClick={() => onDissolve(true)}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete all
              </button>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4">
            {members.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onPopOut(note.id)}
                title="Take this note out of the folder"
                className="flex h-28 flex-col rounded-lg p-2.5 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
                style={{ background: note.color }}
              >
                <span className="truncate text-sm font-semibold">{note.title}</span>
                <span className="mt-1 flex-1 overflow-hidden text-xs opacity-70">
                  {preview(note.content) || 'Empty note'}
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={onAddNote}
              className="flex h-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-black/20 text-xs font-medium opacity-70 hover:opacity-100 hover:bg-black/5"
            >
              <Plus size={18} />
              New note here
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
