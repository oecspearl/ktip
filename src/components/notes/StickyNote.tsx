import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import DOMPurify from 'dompurify'
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  MoreHorizontal,
  MousePointerClick,
  Pencil,
  Pin,
  Quote,
  Strikethrough,
  Trash2,
  Underline,
  X,
} from 'lucide-react'
import {
  boxOf,
  clampNotePosition,
  clampSize,
  COLOR_LABELS,
  fractionToPixels,
  headerColor,
  NOTE_COLORS,
  NOTE_MINIMIZED_HEIGHT,
  NOTE_TEXT_COLOR,
  pixelsToFraction,
  type StickyNoteRecord,
  type Viewport,
} from '../../lib/sticky-notes'
import type { StickyNotePatch } from '../../hooks/useStickyNotes'
import { ghostGlowColor, useGhostMode } from '../../hooks/useGhostMode'
import { GhostOpacityControl } from '../ui/GhostOpacityControl'
import { cn } from '../../lib/utils'

/** `document.execCommand` is formally deprecated and formally irreplaceable:
 *  every shipping engine still implements it, and the alternative is either a
 *  Selection/Range editor of our own or a third editor library in a codebase
 *  that already carries TipTap for long-form content. A sticky note is not
 *  long-form content — it is a scrap of text with six formatting buttons. */
function exec(command: string, value?: string) {
  document.execCommand(command, false, value)
}

/** Only the tags the toolbar can produce survive a round trip. The author is
 *  the only writer today, but content is stored as HTML and re-injected as
 *  HTML — the moment that stops being true, this is the thing standing
 *  between a note and a script tag. */
const SANITIZE = {
  ALLOWED_TAGS: [
    'p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'hr', 'code',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
}

function clean(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE)
}

const TOOLBAR: { label: string; icon: typeof Bold; command: string; value?: string }[] = [
  { label: 'Bold', icon: Bold, command: 'bold' },
  { label: 'Italic', icon: Italic, command: 'italic' },
  { label: 'Underline', icon: Underline, command: 'underline' },
  { label: 'Strikethrough', icon: Strikethrough, command: 'strikeThrough' },
  { label: 'Bulleted list', icon: List, command: 'insertUnorderedList' },
  { label: 'Numbered list', icon: ListOrdered, command: 'insertOrderedList' },
  { label: 'Quote', icon: Quote, command: 'formatBlock', value: 'blockquote' },
]

interface StickyNoteProps {
  note: StickyNoteRecord
  viewport: Viewport
  zIndex: number
  autoFocus: boolean
  onFocused: () => void
  /** Debounced — for keystrokes */
  onChange: (patch: StickyNotePatch) => void
  /** Immediate — for drags, resizes, toggles */
  onCommit: (patch: StickyNotePatch) => void
  onClose: () => void
  onDelete: () => void
  onFront: () => void
  /** Told where the pointer is during a drag, so the overlay can test whether
   *  it is over another note or a folder. */
  onDragMove: (clientX: number, clientY: number) => void
  onDragEnd: () => void
}

/**
 * One note: a draggable, resizable scrap of rich text.
 *
 * Positions come in as viewport fractions and are only turned into pixels
 * here; a drag holds pixels in local state and converts back on release, so
 * the note tracks the cursor without a render pass through the cache on every
 * pointer event.
 *
 * Nothing inside is theme-aware. A yellow sticky note that turns brown at dusk
 * stops being the same note — the palette is fixed and the text is always dark.
 */
export function StickyNote({
  note,
  viewport,
  zIndex,
  autoFocus,
  onFocused,
  onChange,
  onCommit,
  onClose,
  onDelete,
  onFront,
  onDragMove,
  onDragEnd,
}: StickyNoteProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [dragPx, setDragPx] = useState<{ left: number; top: number } | null>(null)
  const [sizePx, setSizePx] = useState<{ width: number; height: number } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(note.title)
  /** False for the first paint only, so the note has a state to animate *from* */
  const [entered, setEntered] = useState(false)
  const gestureStart = useRef({ x: 0, y: 0, left: 0, top: 0, width: 0, height: 0 })

  // A pinned note follows you from page to page, which is exactly when it is
  // most in the way. Ghosted, it fades to a shape and lets the page take every
  // click; hovering lights its edge and offers the way back in.
  const ghost = useGhostMode({ enabled: note.pinned, ref: rootRef })

  // Two frames, not one: a single rAF can land in the same paint as the mount
  // and the browser collapses the transition to nothing.
  useEffect(() => {
    const outer = requestAnimationFrame(() => {
      const inner = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(inner)
    })
    return () => cancelAnimationFrame(outer)
  }, [])

  // Written into the DOM once, not on every render: React re-rendering a
  // contentEditable it does not own puts the caret back at the start on every
  // keystroke.
  useEffect(() => {
    if (bodyRef.current && bodyRef.current.innerHTML === '') {
      bodyRef.current.innerHTML = clean(note.content)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  useEffect(() => {
    if (!autoFocus) return
    bodyRef.current?.focus()
    onFocused()
  }, [autoFocus, onFocused])

  const box = boxOf(note)
  // Re-clamped on every render rather than written back to the row: a note
  // parked at the right edge of a wide monitor should still be reachable on a
  // narrow one without permanently moving it.
  const resting = fractionToPixels(clampNotePosition(note, viewport, box), viewport)
  const pos = dragPx ?? resting
  const size = sizePx ?? { width: note.width, height: note.height }

  // ----- drag ----------------------------------------------------------

  const startDrag = (e: React.PointerEvent) => {
    // Buttons, the editor and the toolbar opt out, or the note would move
    // every time someone tried to use one.
    if (e.button !== 0 || (e.target as HTMLElement).closest('.no-drag')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    gestureStart.current = { ...gestureStart.current, x: e.clientX, y: e.clientY, left: resting.left, top: resting.top }
    setDragPx(resting)
    onFront()
  }

  const onDrag = (e: React.PointerEvent) => {
    if (!dragPx) return
    const g = gestureStart.current
    setDragPx({ left: g.left + (e.clientX - g.x), top: g.top + (e.clientY - g.y) })
    onDragMove(e.clientX, e.clientY)
  }

  const endDrag = (e: React.PointerEvent) => {
    if (!dragPx) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    onCommit(pixelsToFraction(dragPx, viewport, box))
    setDragPx(null)
    onDragEnd()
  }

  // Dragging is a mouse gesture; the same move has to be possible from the
  // keyboard, or a note can only be repositioned by people using a pointer.
  const onHandleKeyDown = (e: React.KeyboardEvent) => {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-0.02, 0],
      ArrowRight: [0.02, 0],
      ArrowUp: [0, -0.02],
      ArrowDown: [0, 0.02],
    }
    const move = delta[e.key]
    if (!move) return
    e.preventDefault()
    onCommit(clampNotePosition({ x: note.x + move[0], y: note.y + move[1] }, viewport, box))
  }

  // ----- resize --------------------------------------------------------

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    gestureStart.current = {
      ...gestureStart.current,
      x: e.clientX,
      y: e.clientY,
      width: note.width,
      height: note.height,
    }
    setSizePx({ width: note.width, height: note.height })
    onFront()
  }

  const onResize = (e: React.PointerEvent) => {
    if (!sizePx) return
    const g = gestureStart.current
    setSizePx(clampSize({ width: g.width + (e.clientX - g.x), height: g.height + (e.clientY - g.y) }))
  }

  const endResize = (e: React.PointerEvent) => {
    if (!sizePx) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    onCommit(sizePx)
    setSizePx(null)
  }

  // ----- editor --------------------------------------------------------

  const applyCommand = useCallback(
    (command: string, value?: string) => {
      bodyRef.current?.focus()
      exec(command, value)
      if (bodyRef.current) onChange({ content: clean(bodyRef.current.innerHTML) })
    },
    [onChange]
  )

  const insertLink = () => {
    const url = window.prompt('Link address')
    if (!url) return
    bodyRef.current?.focus()
    exec('createLink', url)
    if (bodyRef.current) onChange({ content: clean(bodyRef.current.innerHTML) })
  }

  const startTitleEdit = () => {
    setDraftTitle(note.title)
    setEditingTitle(true)
  }

  const commitTitle = () => {
    setEditingTitle(false)
    const next = draftTitle.trim()
    if (next && next !== note.title) onCommit({ title: next })
  }

  const handleClose = () => {
    setClosing(true)
    // Matches the 220ms exit below — unmounting sooner cuts the animation off
    window.setTimeout(onClose, 220)
  }

  // The options popover cannot survive its note going see-through — it would
  // be a faded, unclickable menu hanging off nothing.
  useEffect(() => {
    if (ghost.ghosted) setMenuOpen(false)
  }, [ghost.ghosted])

  const head = headerColor(note.color)

  /** The paper, at ghost strength. Computed here rather than in CSS because a
   *  note sets its own `background` inline, and inline beats a stylesheet. */
  const paper = ghost.ghosted
    ? `color-mix(in srgb, ${note.color} ${ghost.opacity * 100}%, transparent)`
    : note.color

  /** The note glows in its own colour, so two ghosts side by side are still
   *  telling you which is which — lifted or deepened to stay legible against
   *  whatever page it has followed you onto. */
  const ghostVars = {
    '--ghost-opacity': ghost.opacity,
    '--ghost-glow-color': ghostGlowColor(note.color, ghost.tone),
  } as CSSProperties

  const pin = () => onCommit({ pinned: true, page_path: note.page_path })
  /** Unpinning drops the note on the page it was unpinned from, rather than
   *  sending it back to wherever it was written. */
  const unpin = () => onCommit({ pinned: false, page_path: window.location.pathname })

  /** One transform for the whole note. Dragging beats closing beats entering,
   *  because they cannot happen at once and the last state to win should be
   *  the one the person is currently causing. */
  const scale = dragPx ? 1.02 : closing ? 0.85 : entered ? 1 : 0.85

  if (note.minimized) {
    return (
      <div
        ref={rootRef}
        data-ghost={ghost.ghosted ? 'true' : undefined}
        className={cn(
          'ghost-surface absolute rounded-xl shadow-fab overflow-hidden',
          ghost.ghosted ? 'pointer-events-none' : 'pointer-events-auto'
        )}
        style={{
          left: pos.left,
          top: pos.top,
          width: Math.min(note.width, 240),
          zIndex,
          ...ghostVars,
          // The pill animates on the same terms as the full note, so closing a
          // minimized one is not an instant disappearance
          transform: `scale(${closing ? 0.85 : entered ? 1 : 0.85})`,
          opacity: closing || !entered ? 0 : 1,
          transition: dragPx
            ? 'none'
            : 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease, background-color 0.26s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="ghost-live-row flex items-center gap-2 px-3 cursor-grab active:cursor-grabbing touch-none"
          style={{ background: head, color: NOTE_TEXT_COLOR, height: NOTE_MINIMIZED_HEIGHT }}
        >
          <span className="flex-1 truncate text-sm font-semibold">{note.title}</span>
          {/* A minimized note has no pin button to turn into the way back, so
              the way back is added for as long as it is ghosted. */}
          {ghost.ghosted && (
            <button
              type="button"
              aria-label="Wake note"
              title="Wake — brings the note back without unpinning it"
              onClick={ghost.wake}
              className="ghost-live no-drag rounded bg-ktip-ocean-600 p-1 text-white shadow-fab"
            >
              <MousePointerClick size={14} />
            </button>
          )}
          <button
            type="button"
            aria-label="Expand note"
            onClick={() => onCommit({ minimized: false })}
            className="no-drag p-1 rounded hover:bg-black/10"
          >
            <MoreHorizontal size={14} />
          </button>
          <button
            type="button"
            aria-label="Close note"
            onClick={handleClose}
            className="no-drag p-1 rounded hover:bg-black/10"
          >
            <X size={14} />
          </button>
        </div>
        {ghost.ghosted && <span aria-hidden className="ghost-glow" />}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      data-sticky-id={note.id}
      data-ghost={ghost.ghosted ? 'true' : undefined}
      onPointerDownCapture={onFront}
      className={cn(
        'ghost-surface absolute flex flex-col rounded-xl overflow-hidden shadow-fab',
        // A ghost is not a drop target either: it is not there to be dragged
        // onto, and elementsFromPoint would happily file a note into it.
        ghost.ghosted ? 'pointer-events-none' : 'pointer-events-auto',
        dragPx ? 'shadow-fab-hover select-none' : 'transition-shadow hover:shadow-fab-hover'
      )}
      style={{
        left: pos.left,
        top: pos.top,
        width: size.width,
        height: size.height,
        zIndex,
        ...ghostVars,
        background: paper,
        color: NOTE_TEXT_COLOR,
        transform: `scale(${scale})`,
        opacity: closing || !entered ? 0 : 1,
        transition: dragPx
          ? 'none'
          : closing
            ? 'transform 0.22s cubic-bezier(0.4,0,1,1), opacity 0.2s ease'
            : // Overshooting spring on the way in, so a new note lands on the
              // page rather than appearing on it. The paper fades on its own,
              // slower curve — that one is ghost mode, not arrival.
              'transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease, background-color 0.26s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {/* Element styling for the editor, scoped to this note by its id so one
          note's heading rules cannot leak into another's. */}
      <style>{`
        [data-sticky-id="${note.id}"] .sn-body h1 { font-size: 1.15rem; font-weight: 700; margin: 0.4em 0 0.2em; }
        [data-sticky-id="${note.id}"] .sn-body h2 { font-size: 1rem; font-weight: 700; margin: 0.4em 0 0.2em; }
        [data-sticky-id="${note.id}"] .sn-body ul { list-style: disc; padding-left: 1.2em; margin: 0.2em 0; }
        [data-sticky-id="${note.id}"] .sn-body ol { list-style: decimal; padding-left: 1.3em; margin: 0.2em 0; }
        [data-sticky-id="${note.id}"] .sn-body blockquote { border-left: 3px solid rgba(0,0,0,0.2); padding-left: 0.6em; margin: 0.3em 0; font-style: italic; }
        [data-sticky-id="${note.id}"] .sn-body a { text-decoration: underline; }
        [data-sticky-id="${note.id}"] .sn-body hr { border: 0; border-top: 1px solid rgba(0,0,0,0.2); margin: 0.6em 0; }
        [data-sticky-id="${note.id}"] .sn-body:empty::before { content: attr(data-placeholder); opacity: 0.45; }
      `}</style>

      {/* Header — the drag handle */}
      <div
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // ghost-live-row keeps the pin reachable while the note is ghosted —
        // everything else in the header fades with the paper.
        className="ghost-live-row group/head flex items-center gap-1 px-2 py-1.5 cursor-grab active:cursor-grabbing touch-none"
        style={{ background: head }}
      >
        {/* The title is text until you ask for it. An always-live input meant
            every press on the widest part of the header put a caret in the
            name instead of picking the note up. */}
        {editingTitle ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle()
              if (e.key === 'Escape') {
                setDraftTitle(note.title)
                setEditingTitle(false)
              }
            }}
            aria-label="Note title"
            className="no-drag min-w-0 flex-1 rounded bg-black/5 px-1 text-sm font-bold outline-none"
          />
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate px-1 text-sm font-bold select-none">
              {note.title}
            </span>
            <button
              type="button"
              aria-label="Rename note"
              title="Rename"
              onClick={startTitleEdit}
              className="no-drag rounded p-1 opacity-0 transition-opacity hover:bg-black/10 focus-visible:opacity-100 group-hover/head:opacity-100"
            >
              <Pencil size={13} />
            </button>
          </>
        )}

        <div className="relative">
          <button
            type="button"
            aria-label="Note options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="no-drag p-1 rounded hover:bg-black/10"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div
              className="no-drag absolute right-0 top-full mt-1 w-56 rounded-lg bg-white/95 backdrop-blur p-2 shadow-fab-hover"
              style={{ color: NOTE_TEXT_COLOR }}
            >
              <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-60">
                Colour
              </p>
              <div className="flex flex-wrap gap-1.5 px-1">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={COLOR_LABELS[c] ?? c}
                    aria-pressed={note.color === c}
                    onClick={() => {
                      onCommit({ color: c })
                      setMenuOpen(false)
                    }}
                    style={{ background: c }}
                    className={cn(
                      'w-5 h-5 rounded-full border border-black/10 transition-transform hover:scale-110',
                      note.color === c && 'ring-2 ring-offset-1 ring-black/40'
                    )}
                  />
                ))}
              </div>
              {/* Ghost mode is one setting shared by every pinned surface, so
                  it is offered here rather than only from the messages panel —
                  a note is where most people meet it first. */}
              <div className="mt-2 border-t border-black/10 px-1 pt-1">
                <GhostOpacityControl />
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}
                className="mt-2 flex w-full items-center gap-2 rounded px-1 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                <Trash2 size={13} />
                Delete permanently
              </button>
            </div>
          )}
        </div>

        {/* One control, three states: pin it, wake it, unpin it. While the note
            is ghosted this is the only thing on it still taking clicks, so it
            is also the only way back in. */}
        <button
          type="button"
          aria-label={
            ghost.ghosted ? 'Wake note' : note.pinned ? 'Unpin from other pages' : 'Pin to every page'
          }
          aria-pressed={note.pinned}
          title={
            ghost.ghosted
              ? 'Wake — brings the note back without unpinning it'
              : note.pinned
                ? 'Pinned everywhere — unpin to stop it fading'
                : 'Only on this page'
          }
          onClick={() => (ghost.ghosted ? ghost.wake() : note.pinned ? unpin() : pin())}
          className={cn(
            'ghost-live no-drag p-1 rounded transition-colors hover:bg-black/10',
            note.pinned && 'bg-black/10',
            // Alone on a see-through note, the control brings its own backing.
            ghost.ghosted && 'bg-ktip-ocean-600 text-white shadow-fab hover:bg-ktip-ocean-600'
          )}
        >
          {ghost.ghosted ? (
            <MousePointerClick size={15} />
          ) : (
            /* The pin swings down into the paper when it goes in, and back out
               when it comes off — the state change is the animation. */
            <Pin
              size={15}
              className="transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              style={{ transform: note.pinned ? 'rotate(45deg)' : 'rotate(0deg)' }}
              fill={note.pinned ? 'currentColor' : 'none'}
            />
          )}
        </button>
        <button
          type="button"
          aria-label="Minimize note"
          onClick={() => onCommit({ minimized: true })}
          className="no-drag p-1 rounded hover:bg-black/10"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          aria-label="Close note"
          title="Closing keeps the note in your saved list"
          onClick={handleClose}
          className="no-drag p-1 rounded hover:bg-black/10"
        >
          <X size={16} />
        </button>
      </div>

      {/* Keyboard-only drag handle. The header is a pointer affordance; this
          is the same move for people who never touch a mouse. */}
      <button
        type="button"
        aria-label="Move note with the arrow keys"
        onKeyDown={onHandleKeyDown}
        className="sr-only focus:not-sr-only focus:m-1 focus:rounded focus:bg-black/10 focus:px-2 focus:py-1 focus:text-xs"
      >
        Move note
      </button>

      <div
        ref={bodyRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`${note.title} contents`}
        data-placeholder="Write anything…"
        onInput={(e) => onChange({ content: clean(e.currentTarget.innerHTML) })}
        onBlur={(e) => onCommit({ content: clean(e.currentTarget.innerHTML) })}
        className="sn-body no-drag flex-1 overflow-y-auto px-3 py-2 text-sm leading-relaxed outline-none"
      />

      {/* Toolbar — horizontally scrollable, because a narrow note cannot fit
          nine buttons and hiding them would be worse than scrolling. */}
      <div
        className="no-drag flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ background: head }}
      >
        {TOOLBAR.map(({ label, icon: Icon, command, value }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyCommand(command, value)}
            className="shrink-0 p-1.5 rounded hover:bg-black/10"
          >
            <Icon size={14} />
          </button>
        ))}
        <button
          type="button"
          aria-label="Insert link"
          title="Insert link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertLink}
          className="shrink-0 p-1.5 rounded hover:bg-black/10"
        >
          <Link2 size={14} />
        </button>
        <button
          type="button"
          aria-label="Divider"
          title="Divider"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyCommand('insertHorizontalRule')}
          className="shrink-0 p-1.5 rounded hover:bg-black/10"
        >
          <Minus size={14} />
        </button>
      </div>

      <div
        onPointerDown={startResize}
        onPointerMove={onResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        role="separator"
        aria-label="Resize note"
        className="no-drag absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
        style={{
          background:
            'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.18) 100%)',
        }}
      />

      {ghost.ghosted && <span aria-hidden className="ghost-glow" />}
    </div>
  )
}
