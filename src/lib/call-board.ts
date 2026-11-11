/**
 * The workshop board: a chalkboard the host draws on, sent into the call as a
 * screen share. Pure pieces here; the component is CallBoard.tsx.
 */

/** Track name that marks a screen share as the board rather than a screen. */
export const BOARD_TRACK = 'ktip-board'

/** 16:9 at 720p: sharp enough for handwriting, light enough for the room. */
export const BOARD_WIDTH = 1280
export const BOARD_HEIGHT = 720

/** Frames per second at most. Chalk does not move faster than this. */
export const BOARD_FPS = 15

export const BOARD_BACKGROUND = '#1E3A32'

export const PEN_WIDTH = 6
export const ERASER_WIDTH = 44

export interface BoxLike {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where a pointer lands on the board, in board pixels.
 *
 * The canvas is drawn object-contain, so a box that is not 16:9 has bars on
 * two sides. A press on a bar maps to the nearest edge rather than off the
 * board, so a stroke that runs past the edge stays on it.
 */
export function boardPoint(
  clientX: number,
  clientY: number,
  box: BoxLike,
  width = BOARD_WIDTH,
  height = BOARD_HEIGHT
): { x: number; y: number } {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 }
  const scale = Math.min(box.width / width, box.height / height)
  const offsetX = (box.width - width * scale) / 2
  const offsetY = (box.height - height * scale) / 2
  const x = (clientX - box.left - offsetX) / scale
  const y = (clientY - box.top - offsetY) / scale
  return {
    x: Math.min(width, Math.max(0, x)),
    y: Math.min(height, Math.max(0, y)),
  }
}

/**
 * A typed agenda for the board: a title and the steps of the session. The host
 * writes it once on the room's call (`board` in that section's config), and the
 * board opens with it already chalked up, the current step marked.
 */
export interface BoardAgenda {
  title: string
  steps: string[]
}

/** Read an agenda off a section config. Null when there is nothing usable. */
export function parseBoardAgenda(raw: unknown): BoardAgenda | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const steps = Array.isArray(row.steps)
    ? row.steps
        .filter((step): step is string => typeof step === 'string')
        .map((step) => step.trim().slice(0, 90))
        .filter(Boolean)
        .slice(0, 7)
    : []
  if (!steps.length) return null
  const title = typeof row.title === 'string' ? row.title.trim().slice(0, 60) : ''
  return { title, steps }
}

/** Break a line of text so each piece fits `max` characters, on word edges. */
export function wrapBoardLine(text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > max) {
      out.push(line)
      line = word
    } else {
      line = line ? line + ' ' + word : word
    }
  }
  if (line) out.push(line)
  return out
}
