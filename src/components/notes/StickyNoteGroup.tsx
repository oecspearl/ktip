import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  clampNotePosition,
  fractionToPixels,
  GROUP_SIZE,
  headerColor,
  NOTE_TEXT_COLOR,
  pixelsToFraction,
  type StickyGroupRecord,
  type StickyNoteRecord,
  type Viewport,
} from '../../lib/sticky-notes'
import type { StickyGroupPatch } from '../../hooks/useStickyNotes'
import { cn } from '../../lib/utils'

/** Remembered answer to the close dialog. Asking the same question every time
 *  is how a confirmation becomes a reflex nobody reads. */
const CLOSE_PREF_KEY = 'ktip_folder_close_pref'
type ClosePref = 'minimize' | 'delete'

function readClosePref(): ClosePref | null {
  try {
    const raw = window.localStorage.getItem(CLOSE_PREF_KEY)
    return raw === 'minimize' || raw === 'delete' ? raw : null
  } catch {
    return null
  }
}

interface StickyNoteGroupProps {
  group: StickyGroupRecord
  members: StickyNoteRecord[]
  viewport: Viewport
  zIndex: number
  onCommit: (patch: StickyGroupPatch) => void
  onExpand: () => void
  onDissolve: (deleteNotes: boolean) => void
  onFront: () => void
  onDragMove: (clientX: number, clientY: number) => void
  onDragEnd: () => void
}

/**
 * A folder of notes, drawn as a folder: a tab, a shell, and up to three
 * documents fanning out behind it in the colours of the notes inside. The
 * fan is the only preview — a folder that looked like a plain box would give
 * no sense of how much is in it.
 */
export function StickyNoteGroup({
  group,
  members,
  viewport,
  zIndex,
  onCommit,
  onExpand,
  onDissolve,
  onFront,
  onDragMove,
  onDragEnd,
}: StickyNoteGroupProps) {
  const [dragPx, setDragPx] = useState<{ left: number; top: number } | null>(null)
  const [hovered, setHovered] = useState(false)
  const [closing, setClosing] = useState(false)
  const [remember, setRemember] = useState(false)
  const start = useRef({ x: 0, y: 0, left: 0, top: 0 })
  const moved = useRef(false)

  const resting = fractionToPixels(clampNotePosition(group, viewport, GROUP_SIZE), viewport)
  const pos = dragPx ?? resting
  const head = headerColor(group.color)

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.no-drag')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY, left: resting.left, top: resting.top }
    moved.current = false
    setDragPx(resting)
    onFront()
  }

  const onDrag = (e: React.PointerEvent) => {
    if (!dragPx) return
    const s = start.current
    if (Math.abs(e.clientX - s.x) > 3 || Math.abs(e.clientY - s.y) > 3) moved.current = true
    setDragPx({ left: s.left + (e.clientX - s.x), top: s.top + (e.clientY - s.y) })
    onDragMove(e.clientX, e.clientY)
  }

  const endDrag = (e: React.PointerEvent) => {
    if (!dragPx) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    onCommit(pixelsToFraction(dragPx, viewport, GROUP_SIZE))
    setDragPx(null)
    onDragEnd()
    // A press that never travelled is a click, and a click opens the folder.
    if (!moved.current) onExpand()
  }

  const requestClose = () => {
    const pref = readClosePref()
    if (pref === 'minimize') return onCommit({ minimized: true })
    if (pref === 'delete') return onDissolve(true)
    setClosing(true)
  }

  const answer = (choice: ClosePref) => {
    if (remember) {
      try {
        window.localStorage.setItem(CLOSE_PREF_KEY, choice)
      } catch {
        /* a blocked store just means the question gets asked again */
      }
    }
    setClosing(false)
    if (choice === 'minimize') onCommit({ minimized: true })
    else onDissolve(true)
  }

  if (group.minimized) {
    return (
      <div
        className="pointer-events-auto absolute rounded-xl shadow-fab overflow-hidden"
        style={{ left: pos.left, top: pos.top, width: 200, zIndex }}
      >
        <div
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex items-center gap-2 px-3 py-2.5 cursor-grab active:cursor-grabbing touch-none"
          style={{ background: head, color: NOTE_TEXT_COLOR }}
        >
          <span className="flex-1 truncate text-sm font-semibold">{group.title}</span>
          <span className="text-xs opacity-70">{members.length}</span>
          <button
            type="button"
            aria-label="Open folder"
            onClick={() => onCommit({ minimized: false })}
            className="no-drag p-1 rounded hover:bg-black/10 text-xs font-semibold"
          >
            Open
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      data-sticky-group-id={group.id}
      className="pointer-events-auto absolute"
      style={{ left: pos.left, top: pos.top, width: GROUP_SIZE.width, zIndex }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`${group.title} — ${members.length} notes. Opens the folder.`}
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative block w-full cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500 rounded-lg"
        style={{
          transform: hovered && !dragPx ? 'translateY(-8px)' : 'translateY(0)',
          transition: dragPx ? 'none' : 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Documents, fanning out behind the shell on hover */}
        {members.slice(0, 3).map((note, i) => (
          <div
            key={note.id}
            aria-hidden
            className="absolute left-1/2 rounded-t-sm shadow-sm"
            style={{
              width: 82 - i * 6,
              height: 66,
              bottom: 26,
              background: note.color,
              transform: `translateX(-50%) translateX(${hovered ? (i - 1) * 26 : 0}px) translateY(${hovered ? -14 - i * 3 : 0}px) rotate(${hovered ? (i - 1) * 7 : 0}deg)`,
              transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1)',
              zIndex: 3 - i,
            }}
          />
        ))}

        {/* Tab */}
        <div
          aria-hidden
          className="relative h-4 w-[58%] rounded-t-md"
          style={{ background: head, clipPath: 'polygon(0 0, 86% 0, 100% 100%, 0 100%)' }}
        />

        {/* Shell */}
        <div
          aria-hidden
          className="relative h-[76px] rounded-md rounded-tl-none shadow-fab overflow-hidden"
          style={{ background: `linear-gradient(160deg, ${group.color}, ${head})` }}
        >
          <div className="absolute inset-x-0 top-0 h-1/2 bg-white/25" />
          <span
            className="absolute inset-x-1.5 bottom-1.5 truncate text-center text-[11px] font-semibold"
            style={{ color: NOTE_TEXT_COLOR }}
          >
            {group.title}
          </span>
        </div>

        {/* Elliptical shadow, so the folder reads as sitting on the page */}
        <div
          aria-hidden
          className="mx-auto mt-1 h-1.5 rounded-[50%] bg-black/20 blur-[2px]"
          style={{ width: hovered ? '70%' : '55%', transition: 'width 0.22s ease' }}
        />

        <span
          className="absolute -top-1 -left-1 rounded-full px-1.5 text-[10px] font-bold shadow-sm"
          style={{ background: head, color: NOTE_TEXT_COLOR }}
        >
          {members.length}
        </span>
      </button>

      {hovered && (
        <button
          type="button"
          aria-label="Close folder"
          onClick={requestClose}
          className="no-drag absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
        >
          <X size={12} />
        </button>
      )}

      {closing && (
        <div
          role="dialog"
          aria-label="Close this folder?"
          className="no-drag absolute left-1/2 top-full z-10 mt-2 w-56 -translate-x-1/2 rounded-xl border border-ktip-sand-200 bg-ktip-cream p-3 shadow-fab-hover"
        >
          <p className="text-sm font-semibold text-ktip-sand-900">Close this folder?</p>
          <p className="mt-1 text-xs text-ktip-sand-600">
            Minimizing keeps the notes. Deleting removes all {members.length} of them.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-ktip-sand-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded border-ktip-sand-300"
            />
            Remember my choice
          </label>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setClosing(false)}
              className="rounded-lg px-2 py-1 text-xs text-ktip-sand-600 hover:bg-ktip-sand-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => answer('minimize')}
              className="rounded-lg border border-ktip-sand-200 px-2 py-1 text-xs font-medium text-ktip-sand-700 hover:bg-ktip-sand-50"
            >
              Minimize
            </button>
            <button
              type="button"
              onClick={() => answer('delete')}
              className={cn('rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700')}
            >
              Delete all
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
