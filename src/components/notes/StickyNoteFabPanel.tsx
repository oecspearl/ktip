import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Folder, Plus, Trash2, X } from 'lucide-react'
import { useStickyNotesPanel } from '../../contexts/StickyNotesContext'
import { cn } from '../../lib/utils'
import { Plural, Trans, useLingui } from '@lingui/react/macro'

function preview(html: string, max = 48): string {
  const el = document.createElement('div')
  el.innerHTML = html
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * The saved list: every note that exists but is not currently on screen.
 *
 * Closing a note does not delete it, which only works if there is somewhere to
 * find it again — this is that place. Filed notes are shown under their folder
 * so the list matches what the folder graphic implies.
 */
export function StickyNoteFabPanel() {
  const { t } = useLingui()
  const {
    notes,
    groups,
    openNoteIds,
    addNote,
    openNote,
    deleteNote,
    setExpandedGroupId,
    setFabPanelOpen,
  } = useStickyNotesPanel()

  const [collapsed, setCollapsed] = useState<string[]>([])
  const [confirmClear, setConfirmClear] = useState(false)

  const saved = notes.filter((n) => !openNoteIds.includes(n.id))
  const loose = saved.filter((n) => !n.group_id)
  const filedGroups = groups
    .map((g) => ({ group: g, members: saved.filter((n) => n.group_id === g.id) }))
    .filter((g) => g.members.length > 0)

  const toggle = (id: string) =>
    setCollapsed((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))

  return createPortal(
    <div className="fixed bottom-24 right-4 z-fab w-72 max-h-[60vh] flex flex-col rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-fab-hover animate-slide-up">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-ktip-sand-100">
        <p className="text-sm font-semibold text-ktip-sand-900"><Trans>Sticky notes</Trans></p>
        <button
          type="button"
          aria-label={t`Close panel`}
          onClick={() => setFabPanelOpen(false)}
          className="p-1 rounded-lg text-ktip-sand-400 hover:bg-ktip-sand-100 hover:text-ktip-sand-700 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-3 py-2.5 border-b border-ktip-sand-100">
        <button
          type="button"
          onClick={() => {
            addNote()
            setFabPanelOpen(false)
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-ktip-tropical-500 px-3 py-2 text-sm font-semibold text-ktip-ocean-700 shadow-medium transition-transform hover:-translate-y-0.5 hover:shadow-hard"
        >
          <Plus size={16} />
          <Trans>New note</Trans>
        </button>
        <p className="mt-2 text-xs text-ktip-sand-500">
          {openNoteIds.length === 0 ? (
            t`Nothing on screen right now`
          ) : (
            <Plural value={openNoteIds.length} one="# note on screen" other="# notes on screen" />
          )}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {saved.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ktip-sand-500">
            <Trans>No saved notes. Closing a note keeps it here instead of deleting it.</Trans>
          </p>
        ) : (
          <>
            {filedGroups.map(({ group, members }) => {
              const isCollapsed = collapsed.includes(group.id)
              return (
                <div key={group.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-ktip-sand-700 hover:bg-ktip-sand-100"
                  >
                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    <Folder size={13} style={{ color: group.color }} />
                    <span className="flex-1 truncate">{group.title}</span>
                    <span className="text-ktip-sand-400">{members.length}</span>
                  </button>

                  {!isCollapsed && (
                    <ul className="ml-3 border-l border-ktip-sand-200 pl-2">
                      {members.map((note) => (
                        <li key={note.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedGroupId(group.id)
                              setFabPanelOpen(false)
                            }}
                            className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ktip-sand-100"
                          >
                            <span
                              aria-hidden
                              className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                              style={{ background: note.color }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium text-ktip-sand-800">
                                {note.title}
                              </span>
                              <span className="block truncate text-[11px] text-ktip-sand-500">
                                {preview(note.content) || t`Empty note`}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}

            {loose.map((note) => (
              <div
                key={note.id}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ktip-sand-100"
              >
                <button
                  type="button"
                  onClick={() => {
                    openNote(note.id)
                    setFabPanelOpen(false)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                    style={{ background: note.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ktip-sand-800">
                      {note.title}
                    </span>
                    <span className="block truncate text-[11px] text-ktip-sand-500">
                      {preview(note.content) || t`Empty note`}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t`Delete ${note.title}`}
                  onClick={() => deleteNote(note.id)}
                  className="rounded p-1 text-ktip-sand-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {saved.length > 0 && (
        <div className="border-t border-ktip-sand-100 px-3 py-2">
          {confirmClear ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ktip-sand-600">
                <Plural value={saved.length} one="Delete # saved?" other="Delete # saved?" />
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded px-2 py-1 text-xs text-ktip-sand-600 hover:bg-ktip-sand-100"
                >
                  <Trans>No</Trans>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Only the saved ones — a note still on screen is in use,
                    // and clearing it out from under someone is not "clear
                    // saved", it is data loss.
                    saved.forEach((n) => deleteNote(n.id))
                    setConfirmClear(false)
                  }}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                >
                  <Trans>Yes</Trans>
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className={cn(
                'w-full rounded-lg px-2 py-1.5 text-xs font-medium text-ktip-sand-500',
                'hover:bg-red-50 hover:text-red-600 transition-colors'
              )}
            >
              <Trans>Clear all saved</Trans>
            </button>
          )}
        </div>
      )}
    </div>,
    document.body
  )
}
