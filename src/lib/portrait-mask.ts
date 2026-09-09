/**
 * Pure geometry over a segmentation mask. No canvas, no model, no DOM — this is
 * the half of the portrait cutout that can be unit-tested with a Float32Array.
 *
 * Everything here was shaped by the Phase 0 spike (docs/ERROR-LOG.md,
 * 2026-09-09):
 *
 * - The mask's bounding box touches the frame edges in nearly every headshot
 *   (shoulders fill the bottom, hair the top), so it says nothing about where
 *   the FACE is. Framing is done from the head instead.
 * - Coverage does not separate good cuts from bad — both sit at 40–90% — so
 *   the thresholds below are sanity checks for "found nothing" / "found
 *   everything", not a quality gate.
 * - Softness (the share of pixels the model was unsure about) flags some leaks
 *   and misses others. It is reported, never acted on automatically.
 */

export type SubjectSide = 'left' | 'center' | 'right'

/** A square crop, as fractions of the source image (0..1). */
export interface PortraitFrame {
  x: number
  y: number
  /** Side length, fraction of the source WIDTH. */
  s: number
}

export interface MaskAnalysis {
  /** Share of pixels kept (confidence above the threshold). */
  coverage: number
  /** Share of pixels the model was unsure about (0.15 < v < 0.85). */
  softness: number
  /** Bounding box of kept pixels, fractions of the mask. Null when nothing was kept. */
  bbox: { x: number; y: number; w: number; h: number } | null
  /** Head centre and width, fractions of the mask. */
  head: { cx: number; cy: number; w: number }
  /** Which third of the frame the head sits in — drives where the hero puts its words. */
  side: SubjectSide
  /** Head-centred square crop for the diamond avatar. */
  frame: PortraitFrame
}

/** Below this the model found no person; above it, no background. Both mean "don't cut". */
export const COVERAGE_MIN = 0.05
export const COVERAGE_MAX = 0.95

/** Head-centre x thresholds for left / centre / right. */
const SIDE_LEFT = 0.42
const SIDE_RIGHT = 0.58

/**
 * Square side = this × head width. 2.4 puts a head with a little shoulder
 * inside a diamond whose corners are discarded anyway; measured across 16
 * portraits in the spike, none clipped the face at 48px.
 */
const FRAME_SCALE = 2.4
/** Where the head centre lands inside the frame, as a fraction of its height. */
const HEAD_AT = 0.42

export function subjectSideOf(cx: number): SubjectSide {
  if (cx < SIDE_LEFT) return 'left'
  if (cx > SIDE_RIGHT) return 'right'
  return 'center'
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Read a confidence mask (row-major, `w × h`, values 0..1).
 *
 * The head is measured over the top quarter of the kept region: the median
 * width of the kept run per row is the head width, and the mean of the row
 * centres is its x. That survives a raised hand or a hat brim in a way the
 * widest row (shoulders) never could.
 */
export function analyseMask(
  data: ArrayLike<number>,
  w: number,
  h: number,
  threshold = 0.5
): MaskAnalysis {
  const total = w * h
  let kept = 0
  let unsure = 0
  let minx = w
  let maxx = -1
  let miny = h
  let maxy = -1

  for (let i = 0; i < total; i++) {
    const v = data[i]
    if (v > 0.15 && v < 0.85) unsure++
    if (v > threshold) {
      kept++
      const x = i % w
      const y = (i - x) / w
      if (x < minx) minx = x
      if (x > maxx) maxx = x
      if (y < miny) miny = y
      if (y > maxy) maxy = y
    }
  }

  const coverage = total ? kept / total : 0
  const softness = total ? unsure / total : 0

  if (!kept) {
    // Nothing found: centre everything so a caller that ignores the coverage
    // check still gets a sane crop.
    return {
      coverage,
      softness,
      bbox: null,
      head: { cx: 0.5, cy: 0.4, w: 0.3 },
      side: 'center',
      frame: centredFrame(0.5, 0.4, 0.3, w, h),
    }
  }

  const bbox = { x: minx / w, y: miny / h, w: (maxx - minx + 1) / w, h: (maxy - miny + 1) / h }

  // Head band: top quarter of the kept region, at least a few rows.
  const bandRows = Math.max(4, Math.round((maxy - miny + 1) * 0.25))
  const widths: number[] = []
  const centres: number[] = []
  for (let y = miny; y < miny + bandRows && y <= maxy; y++) {
    let count = 0
    let sum = 0
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (data[row + x] > threshold) {
        count++
        sum += x
      }
    }
    if (count > 2) {
      widths.push(count)
      centres.push(sum / count)
    }
  }
  widths.sort((a, b) => a - b)
  const headPx = widths.length ? widths[widths.length >> 1] : w * 0.3
  const headW = headPx / w
  const headCx = centres.length
    ? centres.reduce((a, b) => a + b, 0) / centres.length / w
    : (minx + maxx) / 2 / w
  // Head centre sits a little over half a head-width below the top of the mask.
  const headCy = miny / h + (headPx * 0.55) / h

  return {
    coverage,
    softness,
    bbox,
    head: { cx: clamp01(headCx), cy: clamp01(headCy), w: headW },
    side: subjectSideOf(headCx),
    frame: centredFrame(headCx, headCy, headW, w, h),
  }
}

/** Square of FRAME_SCALE × head width around the head, clamped inside the image. */
function centredFrame(cx: number, cy: number, headW: number, w: number, h: number): PortraitFrame {
  // Work in pixels so the clamp is against real edges, then return fractions.
  const side = Math.min(Math.max(headW * w * FRAME_SCALE, Math.min(w, h) * 0.2), Math.min(w, h))
  const x = Math.min(Math.max(cx * w - side / 2, 0), w - side)
  const y = Math.min(Math.max(cy * h - side * HEAD_AT, 0), h - side)
  return { x: x / w, y: y / h, s: side / w }
}

/** Fractions → pixels for a given source size. */
export function frameToPixels(frame: PortraitFrame, w: number, h: number) {
  const s = frame.s * w
  return {
    x: Math.min(Math.max(frame.x * w, 0), Math.max(0, w - s)),
    y: Math.min(Math.max(frame.y * h, 0), Math.max(0, h - s)),
    s: Math.min(s, w, h),
  }
}

/** True when the model plausibly found one person against some background. */
export function coverageIsPlausible(coverage: number): boolean {
  return coverage >= COVERAGE_MIN && coverage <= COVERAGE_MAX
}
