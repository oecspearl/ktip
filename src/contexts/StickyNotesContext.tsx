import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router'
import {
  useStickyNotes,
  type StickyGroupPatch,
  type StickyNotePatch,
} from '../hooks/useStickyNotes'
import {
  DEFAULT_GROUP_TITLE,
  nextNoteColor,
  nextNotePosition,
  type StickyGroupRecord,
  type StickyNoteRecord,
} from '../lib/sticky-notes'

interface StickyNotesContextValue {
  notes: StickyNoteRecord[]
  groups: StickyGroupRecord[]
  /** Which notes are on screen. Runtime-only: on reload everything starts
   *  closed and waits in the saved list, so a browser session never opens
   *  twenty notes at once. */
  openNoteIds: string[]
  zOrder: string[]

  addNote: (seed?: Partial<StickyNoteRecord>) => StickyNoteRecord
  openNote: (id: string) => void
  closeNote: (id: string) => void
  bringToFront: (id: string) => void
  updateNote: (id: string, patch: StickyNotePatch) => void
  updateNoteSoon: (id: string, patch: StickyNotePatch) => void
  deleteNote: (id: string) => void

  groupNotes: (aId: string, bId: string) => void
  addNoteToGroup: (groupId: string, noteId: string) => void
  removeNoteFromGroup: (noteId: string) => void
  dissolveGroup: (groupId: string, deleteNotes?: boolean) => void
  updateGroup: (id: string, patch: StickyGroupPatch) => void

  expandedGroupId: string | null
  setExpandedGroupId: (id: string | null) => void

  fabPanelOpen: boolean
  setFabPanelOpen: (open: boolean) => void

  /** The note that was just created, so the overlay can focus it exactly once */
  focusId: string | null
  clearFocus: () => void
}

const StickyNotesContext = createContext<StickyNotesContextValue | null>(null)

/**
 * Holds the notes so the FAB can create one without owning the overlay that
 * draws them — the two live at opposite ends of the layout.
 *
 * Open-ness and stacking order live here rather than in the database: they are
 * about this browser tab right now, and persisting them would mean every
 * reload reopens whatever was on screen a week ago.
 */
export function StickyNotesProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const sticky = useStickyNotes()
  const { notes, groups, createNote, updateNote, deleteNote, createGroup, deleteGroup } = sticky

  const [openNoteIds, setOpenNoteIds] = useState<string[]>([])
  const [zOrder, setZOrder] = useState<string[]>([])
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [fabPanelOpen, setFabPanelOpen] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)

  const raise = useCallback((id: string) => {
    setZOrder((prev) => [...prev.filter((z) => z !== id), id])
  }, [])

  const open = useCallback(
    (id: string) => {
      setOpenNoteIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
      raise(id)
    },
    [raise]
  )

  /** Closing is not deleting — the note moves to the saved list in the FAB
   *  panel. Deleting is a separate, explicit action. */
  const closeNote = useCallback((id: string) => {
    setOpenNoteIds((prev) => prev.filter((n) => n !== id))
  }, [])

  const addNote = useCallback(
    (seed?: Partial<StickyNoteRecord>) => {
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const note = createNote({
        ...nextNotePosition(notes.length, viewport),
        color: nextNoteColor(notes.length),
        // A new note belongs to the page it was written on until it is pinned
        page_path: pathname,
        ...seed,
      })
      open(note.id)
      setFocusId(note.id)
      return note
    },
    [createNote, notes.length, open, pathname]
  )

  const removeNote = useCallback(
    (id: string) => {
      closeNote(id)
      setZOrder((prev) => prev.filter((z) => z !== id))
      deleteNote(id)
    },
    [closeNote, deleteNote]
  )

  /**
   * Drop one note on another to file them together. If either is already in a
   * folder, the other joins that folder rather than making a second one —
   * dragging a loose note onto a filed one obviously means "put it in there".
   */
  const groupNotes = useCallback(
    (aId: string, bId: string) => {
      if (aId === bId) return
      const a = notes.find((n) => n.id === aId)
      const b = notes.find((n) => n.id === bId)
      if (!a || !b) return

      const existing = a.group_id ?? b.group_id
      if (existing) {
        const loose = a.group_id ? b : a
        updateNote(loose.id, { group_id: existing })
        closeNote(loose.id)
        return
      }

      // The folder lands where the note being dropped *onto* sits, which is
      // where the person is already looking.
      const group = createGroup(
        { x: b.x, y: b.y, color: b.color, page_path: b.page_path, title: DEFAULT_GROUP_TITLE },
        [aId, bId]
      )
      closeNote(aId)
      closeNote(bId)
      raise(group.id)
    },
    [closeNote, createGroup, notes, raise, updateNote]
  )

  const addNoteToGroup = useCallback(
    (groupId: string, noteId: string) => {
      updateNote(noteId, { group_id: groupId })
      closeNote(noteId)
    },
    [closeNote, updateNote]
  )

  /**
   * Take a note back out of its folder and put it on screen. A folder that
   * would be left holding a single note dissolves — one item is not a folder,
   * and leaving it as one strands that note behind an extra click.
   */
  const removeNoteFromGroup = useCallback(
    (noteId: string) => {
      const note = notes.find((n) => n.id === noteId)
      if (!note?.group_id) return
      const groupId = note.group_id
      const siblings = notes.filter((n) => n.group_id === groupId && n.id !== noteId)

      updateNote(noteId, { group_id: null })
      open(noteId)

      if (siblings.length === 1) {
        updateNote(siblings[0].id, { group_id: null })
        open(siblings[0].id)
        setExpandedGroupId((prev) => (prev === groupId ? null : prev))
        deleteGroup(groupId)
      }
    },
    [deleteGroup, notes, open, updateNote]
  )

  const dissolveGroup = useCallback(
    (groupId: string, deleteNotes = false) => {
      const members = notes.filter((n) => n.group_id === groupId)
      setExpandedGroupId((prev) => (prev === groupId ? null : prev))

      if (deleteNotes) {
        members.forEach((n) => removeNote(n.id))
        // The 094 trigger reaps the folder once the last note leaves, but the
        // cache has to be told as well, and a folder the member emptied by
        // hand should not flicker back.
        deleteGroup(groupId)
        return
      }

      members.forEach((n) => {
        updateNote(n.id, { group_id: null })
        open(n.id)
      })
      deleteGroup(groupId)
    },
    [deleteGroup, notes, open, removeNote, updateNote]
  )

  const clearFocus = useCallback(() => setFocusId(null), [])

  const value = useMemo(
    () => ({
      notes,
      groups,
      openNoteIds,
      zOrder,
      addNote,
      openNote: open,
      closeNote,
      bringToFront: raise,
      updateNote,
      updateNoteSoon: sticky.updateNoteSoon,
      deleteNote: removeNote,
      groupNotes,
      addNoteToGroup,
      removeNoteFromGroup,
      dissolveGroup,
      updateGroup: sticky.updateGroup,
      expandedGroupId,
      setExpandedGroupId,
      fabPanelOpen,
      setFabPanelOpen,
      focusId,
      clearFocus,
    }),
    [
      addNote,
      addNoteToGroup,
      clearFocus,
      closeNote,
      dissolveGroup,
      expandedGroupId,
      fabPanelOpen,
      focusId,
      groupNotes,
      groups,
      notes,
      open,
      openNoteIds,
      raise,
      removeNote,
      removeNoteFromGroup,
      sticky.updateGroup,
      sticky.updateNoteSoon,
      updateNote,
      zOrder,
    ]
  )

  return <StickyNotesContext.Provider value={value}>{children}</StickyNotesContext.Provider>
}

export function useStickyNotesPanel() {
  const ctx = useContext(StickyNotesContext)
  if (!ctx) throw new Error('useStickyNotesPanel must be used within StickyNotesProvider')
  return ctx
}
