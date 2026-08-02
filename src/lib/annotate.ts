/**
 * Screenshot annotation: the shape model and the maths, kept out of the
 * component so both are testable without a canvas. The component owns pointer
 * events and the 2D context; everything about *what* gets drawn lives here.
 *
 * Three tools only — circle the thing, point at the thing, scribble on the
 * thing. A reporter marking up a bug is not doing illustration, and every
 * extra tool is one more decision between them and sending the report.
 */

export type AnnotationTool = 'pen' | 'ellipse' | 'arrow'

export interface Point {
  x: number
  y: number
}

export interface Shape {
  tool: AnnotationTool
  color: string
  width: number
  /** pen: every sampled point. ellipse/arrow: exactly [start, end]. */
  points: Point[]
}

/** Marker colours, in the order the toolbar shows them. Literal hex rather
 *  than a ktip token: these are painted into a PNG that is read outside the
 *  app, where a CSS variable means nothing — and they must not invert in dark
 *  mode, or an annotation would change colour after it was drawn. */
export const ANNOTATION_COLORS = [
  { id: 'red', label: 'Red', value: '#E23D28' },
  { id: 'sun', label: 'Yellow', value: '#FFC72C' },
  { id: 'tropical', label: 'Green', value: '#97D700' },
  { id: 'ocean', label: 'Navy', value: '#041E42' },
] as const

export const DEFAULT_STROKE_WIDTH = 4

export function beginShape(
  tool: AnnotationTool,
  color: string,
  at: Point,
  width = DEFAULT_STROKE_WIDTH
): Shape {
  // Both ends start together: a click with no drag is a dot, not a crash.
  return { tool, color, width, points: [at, at] }
}

/**
 * Advance the in-progress shape to the pointer's new position. Pen accumulates
 * a trail; ellipse and arrow only ever have a start and a current end, so
 * dragging back over yourself shrinks the shape instead of leaving a tail.
 */
export function extendShape(shape: Shape, at: Point): Shape {
  if (shape.tool === 'pen') {
    return { ...shape, points: [...shape.points, at] }
  }
  return { ...shape, points: [shape.points[0], at] }
}

/** A pen stroke that never moved is a stray click, not an annotation. */
export function isDegenerate(shape: Shape): boolean {
  const [a, b] = [shape.points[0], shape.points[shape.points.length - 1]]
  return shape.points.length < 2 || (Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2)
}

export function undo(shapes: Shape[]): Shape[] {
  return shapes.slice(0, -1)
}

export function ellipseFromPoints(a: Point, b: Point): {
  cx: number
  cy: number
  rx: number
  ry: number
} {
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    rx: Math.abs(b.x - a.x) / 2,
    ry: Math.abs(b.y - a.y) / 2,
  }
}

/**
 * The two barbs of an arrowhead at `to`, swept back toward `from`.
 * Head length tracks stroke width so a thick arrow does not end in a pinprick,
 * and is capped at a third of the shaft so a short arrow is not all head.
 */
export function arrowHead(from: Point, to: Point, strokeWidth = DEFAULT_STROKE_WIDTH): [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const shaft = Math.hypot(to.x - from.x, to.y - from.y)
  const len = Math.min(strokeWidth * 4, Math.max(shaft / 3, 1))
  const spread = Math.PI / 7

  return [
    { x: to.x - len * Math.cos(angle - spread), y: to.y - len * Math.sin(angle - spread) },
    { x: to.x - len * Math.cos(angle + spread), y: to.y - len * Math.sin(angle + spread) },
  ]
}

function strokeStyle(ctx: CanvasRenderingContext2D, shape: Shape) {
  ctx.strokeStyle = shape.color
  ctx.fillStyle = shape.color
  ctx.lineWidth = shape.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape) {
  const start = shape.points[0]
  const end = shape.points[shape.points.length - 1]
  if (!start || !end) return

  strokeStyle(ctx, shape)

  if (shape.tool === 'pen') {
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    for (const p of shape.points.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
    return
  }

  if (shape.tool === 'ellipse') {
    const { cx, cy, rx, ry } = ellipseFromPoints(start, end)
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    return
  }

  const [barbA, barbB] = arrowHead(start, end, shape.width)
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.moveTo(barbA.x, barbA.y)
  ctx.lineTo(end.x, end.y)
  ctx.lineTo(barbB.x, barbB.y)
  ctx.stroke()
}

export function drawAll(ctx: CanvasRenderingContext2D, shapes: Shape[]) {
  for (const shape of shapes) drawShape(ctx, shape)
}
