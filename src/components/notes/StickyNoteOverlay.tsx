import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router'
import { useStickyNotesPanel } from '../../contexts/StickyNotesContext'
import { isGroupOnPage, isNoteOnPage } from '../../lib/sticky-notes'
import { StickyNote } from './StickyNote'
import { StickyNoteGroup } from './StickyNoteGroup'
import { StickyNoteGroupExpanded } from './StickyNoteGroupExpanded'
import { useLingui } from '@lingui/react/macro'

/** Base for a note's stacking. Above the site (navbar 40, modals 50, toasts
 *  100) and below the FAB that creates them (9999). */
const Z_BASE = 901

/**
 * Draws every open note and every folder over the site.
 *
 * Fixed and portalled to `document.body`, so notes survive route changes and
 * are never clipped by a page's own overflow. The layer itself is
 * pointer-events-none — it covers the whole viewport, and anything else would
 * make the site unclickable — with each note switching them back on.
 *
 * It also owns drag-to-file: while a note is being dragged it asks what is
 * under the cursor, and on release drops the note into whatever it landed on.
 * That test lives here rather than in the note because only the overlay knows
 * about the other notes.
 */
export function StickyNoteOverlay() {
  const { t } = useLingui()
  const { pathname } = useLocation()
  const {
    notes,
    groups,
    openNoteIds,
    zOrder,
    updateNote,
    updateNoteSoon,
    updateGroup,
    deleteNote,
    closeNote,
    bringToFront,
    groupNotes,
    addNoteToGroup,
    removeNoteFromGroup,
    dissolveGroup,
    addNote,
    expandedGroupId,
    setExpandedGroupId,
    focusId,
    clearFocus,
  } = useStickyNotesPanel()

  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }))
  /** What the current drag is hovering. Held in a ref because it changes on
   *  every pointer move and nothing renders from it. */
  const dropTarget = useRef<{ kind: 'note' | 'group'; id: string } | null>(null)

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const visibleNotes = notes.filter(
    (n) => !n.group_id && openNoteIds.includes(n.id) && isNoteOnPage(n, pathname)
  )
  const visibleGroups = groups.filter((g) =>
    isGroupOnPage(
      g,
      notes.filter((n) => n.group_id === g.id),
      pathname
    )
  )

  const zIndexOf = (id: string) => {
    const index = zOrder.indexOf(id)
    return Z_BASE + (index === -1 ? 0 : index)
  }

  /** `elementsFromPoint` rather than the event target: the note being dragged
   *  is under the cursor the whole time, so the top hit is always itself. */
  const trackDrag = useCallback((selfId: string) => (clientX: number, clientY: number) => {
    dropTarget.current = null
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const groupId = (el as HTMLElement).dataset?.stickyGroupId
      if (groupId) {
        dropTarget.current = { kind: 'group', id: groupId }
        return
      }
      const noteId = (el as HTMLElement).dataset?.stickyId
      if (noteId && noteId !== selfId) {
        dropTarget.current = { kind: 'note', id: noteId }
        return
      }
    }
  }, [])

  const dropNote = useCallback(
    (selfId: string) => () => {
      const target = dropTarget.current
      dropTarget.current = null
      if (!target) return
      if (target.kind === 'group') addNoteToGroup(target.id, selfId)
      else groupNotes(selfId, target.id)
    },
    [addNoteToGroup, groupNotes]
  )

  const expanded = visibleGroups.find((g) => g.id === expandedGroupId)
  const expandedMembers = expanded ? notes.filter((n) => n.group_id === expanded.id) : []

  if (visibleNotes.length === 0 && visibleGroups.length === 0) return null

  return createPortal(
    <>
      <div
        data-sticky-notes
        aria-label={t`Pinned notes`}
        className="fixed inset-0 z-fab pointer-events-none"
      >
        {visibleGroups.map((group) => (
          <StickyNoteGroup
            key={group.id}
            group={group}
            members={notes.filter((n) => n.group_id === group.id)}
            viewport={viewport}
            zIndex={zIndexOf(group.id)}
            onCommit={(patch) => updateGroup(group.id, patch)}
            onExpand={() => setExpandedGroupId(group.id)}
            onDissolve={(deleteNotes) => dissolveGroup(group.id, deleteNotes)}
            onFront={() => bringToFront(group.id)}
            onDragMove={trackDrag(group.id)}
            // A folder dropped on something does not file itself into it —
            // nesting folders is a filing system, not a sticky note.
            onDragEnd={() => {
              dropTarget.current = null
            }}
          />
        ))}

        {visibleNotes.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            viewport={viewport}
            zIndex={zIndexOf(note.id)}
            autoFocus={note.id === focusId}
            onFocused={clearFocus}
            onChange={(patch) => updateNoteSoon(note.id, patch)}
            onCommit={(patch) => updateNote(note.id, patch)}
            onClose={() => closeNote(note.id)}
            onDelete={() => deleteNote(note.id)}
            onFront={() => bringToFront(note.id)}
            onDragMove={trackDrag(note.id)}
            onDragEnd={dropNote(note.id)}
          />
        ))}
      </div>

      {expanded && (
        <StickyNoteGroupExpanded
          group={expanded}
          members={expandedMembers}
          onClose={() => setExpandedGroupId(null)}
          onCommit={(patch) => updateGroup(expanded.id, patch)}
          onPopOut={(noteId) => removeNoteFromGroup(noteId)}
          onAddNote={() => {
            // Created straight into the folder, so it does not fly out onto
            // the page the moment it exists.
            const note = addNote({ group_id: expanded.id, color: expanded.color })
            closeNote(note.id)
            clearFocus()
          }}
          onDissolve={(deleteNotes) => dissolveGroup(expanded.id, deleteNotes)}
        />
      )}
    </>,
    document.body
  )
}
