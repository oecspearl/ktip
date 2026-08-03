import { useCallback, useEffect, useRef, useState } from 'react'
import { Circle, MoveUpRight, Pencil, RotateCcw, Undo2 } from 'lucide-react'
import {
  ANNOTATION_COLORS,
  beginShape,
  drawAll,
  drawShape,
  extendShape,
  isDegenerate,
  undo,
  type AnnotationTool,
  type Shape,
} from '../../lib/annotate'
import { canvasToBlob } from '../../lib/screen-capture'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/** A 4K screen grab is ~8MB of PNG and nothing in triage needs that; capping
 *  the long edge keeps text legible while staying inside the bucket's 5MB. */
const MAX_EDGE = 1600

const TOOLS: { id: AnnotationTool; label: MessageDescriptor; icon: typeof Pencil }[] = [
  { id: 'ellipse', label: msg`Circle`, icon: Circle },
  { id: 'arrow', label: msg`Arrow`, icon: MoveUpRight },
  { id: 'pen', label: msg`Draw`, icon: Pencil },
]

interface ScreenshotAnnotatorProps {
  /** The raw capture. Owned by the caller — this only reads it. */
  image: Blob
  onDone: (annotated: Blob) => void
  onRetake: () => void
  onCancel: () => void
}

/**
 * Circle the problem. The screenshot is painted onto a canvas and every stroke
 * is flattened into the exported PNG, so the report needs nothing but an image
 * to be understood — no viewer, no shape data, no replay.
 */
export function ScreenshotAnnotator({ image, onDone, onRetake, onCancel }: ScreenshotAnnotatorProps) {
    const { t, i18n } = useLingui()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseRef = useRef<HTMLImageElement | null>(null)
  const [ready, setReady] = useState(false)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Shape | null>(null)
  const [tool, setTool] = useState<AnnotationTool>('ellipse')
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0].value)
  const [saving, setSaving] = useState(false)

  // Load the capture once and size the canvas to it
  useEffect(() => {
    const url = URL.createObjectURL(image)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
      }
      baseRef.current = img
      setReady(true)
    }
    img.src = url
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [image])

  // One redraw for every visual change — repainting the base each time is what
  // makes an in-progress ellipse able to shrink as well as grow.
  useEffect(() => {
    const canvas = canvasRef.current
    const base = baseRef.current
    if (!ready || !canvas || !base) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height)
    drawAll(ctx, shapes)
    if (draft) drawShape(ctx, draft)
  }, [draft, ready, shapes])

  /** Client pixels → canvas pixels. The canvas is displayed at whatever width
   *  the modal allows, which is rarely its intrinsic size. */
  const toCanvas = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft(beginShape(tool, color, toCanvas(e)))
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draft) return
    setDraft(extendShape(draft, toCanvas(e)))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draft) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    // A click that never moved is someone tapping the picture, not drawing
    if (!isDegenerate(draft)) setShapes((prev) => [...prev, draft])
    setDraft(null)
  }

  const handleDone = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)
    try {
      onDone(await canvasToBlob(canvas))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t`Annotation tool`} className="flex items-center gap-1">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTool(id)}
              aria-pressed={tool === id}
              aria-label={i18n._(label)}
              title={i18n._(label)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                tool === id
                  ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                  : 'border-ktip-sand-200 text-ktip-sand-600 hover:bg-ktip-sand-50'
              )}
            >
              <Icon size={14} />
              {i18n._(label)}
            </button>
          ))}
        </div>

        <div role="group" aria-label={t`Marker colour`} className="flex items-center gap-1.5 ml-1">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setColor(c.value)}
              aria-label={i18n._(c.label)}
              aria-pressed={color === c.value}
              title={i18n._(c.label)}
              style={{ backgroundColor: c.value }}
              className={cn(
                'w-5 h-5 rounded-full border border-black/10 transition-transform hover:scale-110',
                color === c.value && 'ring-2 ring-offset-1 ring-ktip-sand-500'
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setShapes(undo)}
            disabled={shapes.length === 0}
            aria-label={t`Undo last mark`}
            title={t`Undo`}
            className="p-1.5 rounded-lg text-ktip-sand-600 hover:bg-ktip-sand-50 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            onClick={onRetake}
            aria-label={t`Take the screenshot again`}
            title={t`Retake`}
            className="p-1.5 rounded-lg text-ktip-sand-600 hover:bg-ktip-sand-50 transition-colors"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-ktip-sand-200 bg-ktip-sand-50 overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={t`Screenshot — drag to mark it up`}
          className="block w-full h-auto touch-none cursor-crosshair"
        />
      </div>

      <p className="text-xs text-ktip-sand-500">
        <Trans>Drag on the image to mark what you are talking about. Only the marked-up copy is sent.</Trans>
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
          <Trans>Discard</Trans>
        </Button>
        <Button size="sm" type="button" loading={saving} onClick={handleDone}>
          <Trans>Attach screenshot</Trans>
        </Button>
      </div>
    </div>
  )
}
