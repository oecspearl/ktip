/**
 * Matte refinement — what turns a segmentation mask into a cut-out that
 * survives being drawn 560 px tall on the member page.
 *
 * Pure Float32Array maths: no canvas, no model, no DOM, so the whole of it is
 * unit-testable and none of it is behind the 12 MB vision chunk.
 *
 * Three steps, in the order they must run:
 *
 * 1. **Drop the islands.** The selfie segmenter answers "person-ish" per pixel
 *    with no notion of one subject, so on a dark or busy background it returns
 *    confident slabs of background far from the person — smoke, a lens flare,
 *    a chair.
 *    A member is one connected thing, so everything not attached to the main
 *    body (and not itself substantial) is a leak and goes.
 * 2. **Fill the holes.** The same mask punches gaps through hair and dark
 *    clothing. A hole fully enclosed by the subject and small is a mistake,
 *    not a window, and a window in a member's jacket reads as a rendering bug.
 * 3. **Snap the edge to the photo.** A 256-input model returns an edge that is
 *    soft in the wrong places: blurred across a hair boundary and hard across
 *    a shoulder. A guided filter re-cuts the soft mask along the photo's own
 *    edges, which is what makes hair read as hair rather than as a halo.
 *
 * Measured against the Phase 0 sample set (docs/ERROR-LOG.md, 2026-09-09):
 * this fixes the disconnected leaks — the smoke blob beside the child, the
 * blob over the hat — for ~150-280 ms of main-thread work and zero extra
 * bytes. It cannot fix a leak that touches the subject (a crowd directly
 * behind a shoulder); nothing cheap can, which is why the studio's preview
 * and one-click revert stay load-bearing.
 */

export interface RefineOptions {
  /**
   * Grey guide, same length as the mask, 0..1. The photo the mask came from.
   * Without it the edge-snapping step is skipped and only the topology fixes
   * run — which is still worth doing.
   */
  guide?: Float32Array | null
  /** Box radius for the guided filter, in mask pixels. */
  radius?: number
  /** Guided-filter regularisation. Smaller = follows the photo's edges harder. */
  eps?: number
  /** Keep an island this big relative to the main body, even if detached. */
  islandRatio?: number
  /** Fill an enclosed hole up to this fraction of the frame. */
  holeMax?: number
  /** Confidence above which a pixel counts as subject for the topology steps. */
  threshold?: number
}

export interface RefineResult {
  mask: Float32Array
  /** Detached components removed, and how many pixels they held. */
  droppedComponents: number
  droppedPixels: number
  /** Enclosed holes filled, and how many pixels they held. */
  filledHoles: number
  filledPixels: number
}

const DEFAULTS = {
  radius: 8,
  eps: 1e-3,
  islandRatio: 0.2,
  holeMax: 0.02,
  threshold: 0.5,
} as const

/**
 * Refine a confidence mask in place-safe fashion (a new array is returned).
 *
 * `w × h` must match `mask.length`; `guide`, when given, must be the same
 * length. Everything is clamped to 0..1 on the way out.
 */
export function refineMatte(
  mask: Float32Array,
  w: number,
  h: number,
  opts: RefineOptions = {}
): RefineResult {
  const { radius, eps, islandRatio, holeMax, threshold } = { ...DEFAULTS, ...opts }
  const n = w * h
  if (mask.length !== n) throw new Error('refineMatte: mask length does not match w × h')

  const out = Float32Array.from(mask)

  // ---------------------------------------------------------- 1. islands
  const labels = new Int32Array(n).fill(-1)
  const sizes: number[] = []
  const stack = new Int32Array(n)

  for (let start = 0; start < n; start++) {
    if (out[start] <= threshold || labels[start] !== -1) continue
    const label = sizes.length
    let size = 0
    let top = 0
    stack[top++] = start
    labels[start] = label
    while (top > 0) {
      const p = stack[--top]
      size++
      const x = p % w
      const y = (p - x) / w
      // Eight-connected: a hair strand one pixel wide runs diagonally as
      // often as it runs straight, and four-connectivity snips it off the
      // head and then deletes it as an island.
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const q = ny * w + nx
          if (labels[q] !== -1 || out[q] <= threshold) continue
          labels[q] = label
          stack[top++] = q
        }
      }
    }
    sizes.push(size)
  }

  let droppedComponents = 0
  let droppedPixels = 0
  if (sizes.length > 1) {
    let biggest = 0
    for (const size of sizes) if (size > biggest) biggest = size
    const floor = biggest * islandRatio
    const keep = sizes.map((size) => size >= floor)
    for (let i = 0; i < sizes.length; i++) {
      if (!keep[i]) {
        droppedComponents++
        droppedPixels += sizes[i]
      }
    }
    if (droppedComponents > 0) {
      for (let p = 0; p < n; p++) {
        const label = labels[p]
        // Sub-threshold pixels around a dropped island carry confidence too;
        // zeroing only the labelled ones leaves a ghost of it behind.
        if (label >= 0 ? !keep[label] : nearestIsDropped(labels, keep, p, w, h)) out[p] = 0
      }
    }
  }

  // ------------------------------------------------------------ 2. holes
  // Background reachable from the border is the real background; anything
  // else is enclosed by the subject.
  const bg = new Uint8Array(n)
  let top = 0
  const push = (p: number) => {
    if (bg[p] || out[p] > threshold) return
    bg[p] = 1
    stack[top++] = p
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (top > 0) {
    const p = stack[--top]
    const x = p % w
    const y = (p - x) / w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (y > 0) push(p - w)
    if (y < h - 1) push(p + w)
  }

  let filledHoles = 0
  let filledPixels = 0
  const holeCap = n * holeMax
  const seen = new Uint8Array(n)
  for (let start = 0; start < n; start++) {
    if (out[start] > threshold || bg[start] || seen[start]) continue
    // An enclosed pocket: measure it before deciding.
    let size = 0
    let head = 0
    let tail = 0
    stack[tail++] = start
    seen[start] = 1
    const pocket: number[] = []
    while (head < tail) {
      const p = stack[head++]
      pocket.push(p)
      size++
      const x = p % w
      const y = (p - x) / w
      const neighbours = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
      for (const q of neighbours) {
        if (q < 0 || seen[q] || bg[q] || out[q] > threshold) continue
        seen[q] = 1
        stack[tail++] = q
      }
    }
    if (size <= holeCap) {
      filledHoles++
      filledPixels += size
      for (const p of pocket) out[p] = 1
    }
  }

  // ------------------------------------------------------------- 3. edge
  if (opts.guide && opts.guide.length === n && radius > 0) {
    guidedFilter(out, opts.guide, w, h, radius, eps)
  }

  for (let i = 0; i < n; i++) out[i] = out[i] < 0 ? 0 : out[i] > 1 ? 1 : out[i]

  return { mask: out, droppedComponents, droppedPixels, filledHoles, filledPixels }
}

/**
 * True when the nearest labelled neighbour of a soft pixel belongs to a
 * dropped island — the fringe around a leak, which has confidence below the
 * threshold and so was never labelled.
 */
function nearestIsDropped(
  labels: Int32Array,
  keep: boolean[],
  p: number,
  w: number,
  h: number
): boolean {
  const x = p % w
  const y = (p - x) / w
  let dropped = false
  for (let dy = -1; dy <= 1; dy++) {
    const ny = y + dy
    if (ny < 0 || ny >= h) continue
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx
      if (nx < 0 || nx >= w) continue
      const label = labels[ny * w + nx]
      if (label < 0) continue
      if (keep[label]) return false
      dropped = true
    }
  }
  return dropped
}

/**
 * He, Sun & Tang's guided filter, box-accelerated — O(n) regardless of radius.
 *
 * `p` (the mask) is filtered in place under the guidance of `guide` (the grey
 * photo): where the photo has an edge the output keeps one, where the photo is
 * flat the output smooths. That is exactly the correction a 256×256 model's
 * upsampled mask needs.
 */
export function guidedFilter(
  p: Float32Array,
  guide: Float32Array,
  w: number,
  h: number,
  radius: number,
  eps: number
): void {
  const n = w * h
  const meanI = boxMean(guide, w, h, radius)
  const meanP = boxMean(p, w, h, radius)

  const ii = new Float32Array(n)
  const ip = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    ii[i] = guide[i] * guide[i]
    ip[i] = guide[i] * p[i]
  }
  const meanII = boxMean(ii, w, h, radius)
  const meanIP = boxMean(ip, w, h, radius)

  const a = new Float32Array(n)
  const b = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const varI = meanII[i] - meanI[i] * meanI[i]
    const covIP = meanIP[i] - meanI[i] * meanP[i]
    const ai = covIP / (varI + eps)
    a[i] = ai
    b[i] = meanP[i] - ai * meanI[i]
  }
  const meanA = boxMean(a, w, h, radius)
  const meanB = boxMean(b, w, h, radius)

  for (let i = 0; i < n; i++) p[i] = meanA[i] * guide[i] + meanB[i]
}

/**
 * Mean over a (2r+1)² window, via a summed-area table. Float64 for the table:
 * a 1024² image of ones overflows Float32's 24-bit mantissa well before the
 * bottom-right corner, and the error shows up as a gradient across the matte.
 */
export function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const sat = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    const o = (y + 1) * (w + 1)
    const up = y * (w + 1)
    for (let x = 0; x < w; x++) {
      row += src[y * w + x]
      sat[o + x + 1] = sat[up + x + 1] + row
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h - 1, y + r)
    const a = y0 * (w + 1)
    const b = (y1 + 1) * (w + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      const sum = sat[b + x1 + 1] - sat[b + x0] - sat[a + x1 + 1] + sat[a + x0]
      out[y * w + x] = sum / ((y1 - y0 + 1) * (x1 - x0 + 1))
    }
  }
  return out
}

/** Rec. 601 luma, 0..1, from RGBA bytes — the guided filter's guide image. */
export function greyGuide(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const n = rgba.length >> 2
  const out = new Float32Array(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) / 255
  }
  return out
}
