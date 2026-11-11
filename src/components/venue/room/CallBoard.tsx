import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Eraser, Trash2 } from 'lucide-react'
import { useLocalParticipant } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import { cn } from '../../../lib/utils'
import {
  BOARD_BACKGROUND,
  BOARD_FPS,
  BOARD_HEIGHT,
  BOARD_TRACK,
  BOARD_WIDTH,
  ERASER_WIDTH,
  PEN_WIDTH,
  boardPoint,
  wrapBoardLine,
  type BoardAgenda,
} from '../../../lib/call-board'

const CHALK = [
  { value: '#F4F1EA', label: msg`White chalk` },
  { value: '#F5C542', label: msg`Yellow chalk` },
  { value: '#AEE12B', label: msg`Green chalk` },
  { value: '#7EC8F0', label: msg`Blue chalk` },
]

function wipe(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = BOARD_BACKGROUND
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

/** Chalk the agenda onto a clean board, the current step in yellow. */
function drawAgenda(canvas: HTMLCanvasElement, agenda: BoardAgenda, current: number) {
  wipe(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const font = 'ui-sans-serif, system-ui, "Segoe UI", sans-serif'
  ctx.textBaseline = 'top'
  let y = 64
  if (agenda.title) {
    ctx.fillStyle = '#F4F1EA'
    ctx.font = `700 54px ${font}`
    for (const line of wrapBoardLine(agenda.title, 38)) {
      ctx.fillText(line, 80, y)
      y += 66
    }
    y += 22
  }
  agenda.steps.forEach((step, index) => {
    const on = index === current
    const lines = wrapBoardLine(step, 52)
    if (on) {
      ctx.fillStyle = 'rgba(245, 197, 66, 0.14)'
      ctx.fillRect(56, y - 10, canvas.width - 112, lines.length * 46 + 20)
      ctx.fillStyle = '#F5C542'
      ctx.fillRect(56, y - 10, 8, lines.length * 46 + 20)
    }
    ctx.fillStyle = on ? '#F5C542' : index < current ? 'rgba(244, 241, 234, 0.55)' : '#F4F1EA'
    ctx.font = `${on ? 700 : 500} 36px ${font}`
    ctx.fillText(`${index + 1}.`, 84, y)
    for (const line of lines) {
      ctx.fillText(line, 140, y)
      y += 46
    }
    y += 22
  })
}

interface LiveBoard {
  canvas: HTMLCanvasElement
  media: MediaStreamTrack
  keepAlive: number
}

/**
 * Share a board into the call.
 *
 * The board is a canvas only this browser draws on. Its picture goes out as a
 * screen share (source ScreenShare, track name BOARD_TRACK), so everyone else
 * gets the presentation layout with no new code on their side: the board big,
 * the host's face in the corner. Nothing is stored; stopping the share or
 * leaving the call wipes it.
 *
 * Must be inside <LiveKitRoom>.
 */
export function useBoardShare(agenda?: BoardAgenda | null) {
  const { localParticipant } = useLocalParticipant()
  const [board, setBoard] = useState<LiveBoard | null>(null)
  const [pending, setPending] = useState(false)
  const live = useRef<LiveBoard | null>(null)
  live.current = board
  // Which step of the typed agenda is marked. Moving on redraws the board, so
  // anything drawn over the last step goes with it.
  const [step, setStepState] = useState(0)
  const plan = useRef(agenda ?? null)
  plan.current = agenda ?? null
  const setStep = useCallback((next: number) => {
    const current = plan.current
    const canvas = live.current?.canvas
    if (!current || !canvas) return
    const clamped = Math.max(0, Math.min(current.steps.length - 1, next))
    setStepState(clamped)
    drawAgenda(canvas, current, clamped)
  }, [])

  const stop = useCallback(async () => {
    const current = live.current
    if (!current) return
    live.current = null
    setBoard(null)
    window.clearInterval(current.keepAlive)
    try {
      await localParticipant.unpublishTrack(current.media, true)
    } catch {
      current.media.stop()
    }
  }, [localParticipant])

  const start = useCallback(async () => {
    if (live.current) return
    setPending(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = BOARD_WIDTH
      canvas.height = BOARD_HEIGHT
      if (plan.current) drawAgenda(canvas, plan.current, 0)
      else wipe(canvas)
      setStepState(0)
      const media = canvas.captureStream(BOARD_FPS).getVideoTracks()[0]
      if (!media) return
      media.contentHint = 'detail'
      // A canvas only sends a frame when it changes, so someone who joins while
      // the host is talking rather than drawing would see nothing until the
      // next stroke. One frame a second fixes that for the price of nothing.
      const keepAlive = window.setInterval(() => {
        ;(media as MediaStreamTrack & { requestFrame?: () => void }).requestFrame?.()
      }, 1000)
      await localParticipant.publishTrack(media, {
        source: Track.Source.ScreenShare,
        name: BOARD_TRACK,
        simulcast: false,
      })
      const next = { canvas, media, keepAlive }
      live.current = next
      setBoard(next)
    } finally {
      setPending(false)
    }
  }, [localParticipant])

  // Leaving the call unmounts this: the share goes with it.
  useEffect(
    () => () => {
      void stop()
    },
    [stop]
  )

  return {
    canvas: board?.canvas ?? null,
    on: !!board,
    pending,
    start,
    stop,
    /** The typed agenda on this board, if the room has one, and where it is. */
    agenda: agenda ? { steps: agenda.steps.length, step, setStep } : null,
  }
}

/**
 * The host's own view of the board: the live canvas itself, to draw on. Everyone
 * else sees the video of it.
 */
export function BoardCanvas({
  canvas,
  agenda,
}: {
  canvas: HTMLCanvasElement
  agenda?: { steps: number; step: number; setStep: (next: number) => void } | null
}) {
  const { t, i18n } = useLingui()
  const host = useRef<HTMLDivElement>(null)
  const [color, setColor] = useState(CHALK[0].value)
  const [erasing, setErasing] = useState(false)
  const pen = useRef({ color, erasing })
  pen.current = { color, erasing }

  useEffect(() => {
    const box = host.current
    if (!box) return
    canvas.className = 'block h-full w-full cursor-crosshair touch-none object-contain'
    box.appendChild(canvas)

    const ctx = canvas.getContext('2d')
    let last: { x: number; y: number } | null = null
    const at = (event: PointerEvent) => boardPoint(event.clientX, event.clientY, canvas.getBoundingClientRect())
    const line = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      if (!ctx) return
      ctx.strokeStyle = pen.current.erasing ? BOARD_BACKGROUND : pen.current.color
      ctx.lineWidth = pen.current.erasing ? ERASER_WIDTH : PEN_WIDTH
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }
    const down = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId)
      last = at(event)
      line(last, last)
    }
    const move = (event: PointerEvent) => {
      if (!last) return
      const next = at(event)
      line(last, next)
      last = next
    }
    const up = () => {
      last = null
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.remove()
    }
  }, [canvas])

  const swatch = 'grid h-8 w-8 place-items-center rounded-control border border-white/15 transition-colors'

  return (
    <div className="absolute inset-0">
      <div ref={host} className="absolute inset-0" />
      <div
        role="toolbar"
        aria-label={t`Board tools`}
        className="absolute right-3 top-3 z-raised flex flex-wrap items-center gap-1 rounded-control bg-black/60 p-1"
      >
        {agenda && (
          <>
            <button
              type="button"
              aria-label={t`Previous step`}
              title={t`Previous step`}
              disabled={agenda.step <= 0}
              onClick={() => agenda.setStep(agenda.step - 1)}
              className={cn(swatch, 'text-white hover:bg-white/10 disabled:opacity-40')}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="px-1 text-micro font-bold tabular-nums text-white" aria-live="polite">
              {agenda.step + 1} / {agenda.steps}
            </span>
            <button
              type="button"
              aria-label={t`Next step`}
              title={t`Next step`}
              disabled={agenda.step >= agenda.steps - 1}
              onClick={() => agenda.setStep(agenda.step + 1)}
              className={cn(swatch, 'text-white hover:bg-white/10 disabled:opacity-40')}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </>
        )}
        {CHALK.map((chalk) => (
          <button
            key={chalk.value}
            type="button"
            aria-pressed={!erasing && color === chalk.value}
            aria-label={i18n._(chalk.label)}
            title={i18n._(chalk.label)}
            onClick={() => {
              setColor(chalk.value)
              setErasing(false)
            }}
            className={cn(swatch, 'hover:bg-white/10 aria-pressed:border-white aria-pressed:bg-white/15')}
          >
            <span className="h-4 w-4 rounded-full" style={{ background: chalk.value }} aria-hidden="true" />
          </button>
        ))}
        <button
          type="button"
          aria-pressed={erasing}
          aria-label={t`Eraser`}
          title={t`Eraser`}
          onClick={() => setErasing((on) => !on)}
          className={cn(swatch, 'text-white hover:bg-white/10 aria-pressed:border-white aria-pressed:bg-white/15')}
        >
          <Eraser size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t`Wipe the board`}
          title={t`Wipe the board`}
          onClick={() => wipe(canvas)}
          className={cn(swatch, 'text-white hover:bg-white/10')}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
