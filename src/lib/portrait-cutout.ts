/**
 * Background removal for member portraits — runs in the member's own browser.
 *
 * MediaPipe's selfie segmenter (Apache-2.0, 250 KB model) over the tasks-vision
 * WASM runtime, both self-hosted under /vision/ (scripts/copy-vision-wasm.mjs).
 * No recurring cost, no third-party call, nothing leaves the device.
 *
 * Everything heavy is behind the dynamic import below. The runtime is ~12 MB
 * (measured, not the 3 MB first estimated), so it must never be reachable from
 * anything but the settings upload path — `npm run perf:bundle` guards that the
 * vision chunk is its own lazy chunk, absent from entry and vendor.
 *
 * Failure is not an error. When the model will not load, the browser cannot
 * run it, or the mask is implausible, this throws CutoutUnavailableError and
 * the caller falls back to the plain photo. A matting model must never block
 * an avatar upload.
 */

import { canEncodeWebp, decodeImage, fitDimensions } from './image-optimize'
import { alphaBounds, analyseMask, coverageIsPlausible, remapAnalysis, type MaskAnalysis } from './portrait-mask'
import { greyGuide, refineMatte } from './portrait-matte'

export type CutoutPhase = 'loading-model' | 'cutting' | 'refining'

export interface CutoutResult extends MaskAnalysis {
  /** Subject on transparency, EXIF-rotated, longest edge ≤ maxDim. */
  cutout: Blob
  width: number
  height: number
  /**
   * What the refinement pass had to correct. Stray patches of background the
   * model kept, and gaps it punched through the subject — reported so the
   * studio can tell the member when a photo fought the cut, which is the one
   * honest signal there is that a result deserves a second look.
   */
  strayPatches: number
  strayPixels: number
  filledHoles: number
}

export interface CutoutOptions {
  /** Longest edge of the cut-out, px. The hero draws it at ~560 CSS px, so 1024 covers 2×. */
  maxDim?: number
  onPhase?: (phase: CutoutPhase) => void
}

export type CutoutFailure = 'unsupported' | 'model' | 'nothing-found' | 'no-background'

export class CutoutUnavailableError extends Error {
  /** Machine-readable: telemetry and tests read this, people read `message`. */
  readonly reason: CutoutFailure
  constructor(message: string, reason: CutoutFailure) {
    super(message)
    this.name = 'CutoutUnavailableError'
    this.reason = reason
  }
}

/**
 * Edge feather in px at the working resolution. A hard 0/1 edge reads as a
 * sticker. Half what it was before the refinement pass landed: the guided
 * filter now puts the edge on the photo's own boundary, and blurring it 1.5 px
 * afterwards throws that back away.
 */
const FEATHER_PX = 0.75

type Segmenter = import('@mediapipe/tasks-vision').ImageSegmenter

/**
 * One segmenter per page. Creating a second wastes ~2 s and a few MB, and the
 * WASM runtime cannot be unloaded anyway. A failed load is not cached, so a
 * flaky network gets another go on the next upload.
 */
let segmenterPromise: Promise<Segmenter> | null = null

async function getSegmenter(): Promise<Segmenter> {
  if (!segmenterPromise) {
    segmenterPromise = createSegmenter().catch((err) => {
      segmenterPromise = null
      throw err
    })
  }
  return segmenterPromise
}

async function createSegmenter(): Promise<Segmenter> {
  const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks('/vision/wasm')
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: '/vision/selfie_segmenter.tflite', delegate },
    runningMode: 'IMAGE' as const,
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  })
  try {
    return await ImageSegmenter.createFromOptions(vision, options('GPU'))
  } catch {
    // No WebGL2, or a driver the GPU delegate refuses: XNNPACK on the CPU is
    // ~5× slower (120 ms vs 25 ms in the spike) and still fine for one photo.
    return await ImageSegmenter.createFromOptions(vision, options('CPU'))
  }
}

/** True when this browser has what the segmenter needs. Cheap; no download. */
export function cutoutSupported(): boolean {
  return (
    typeof WebAssembly === 'object' &&
    typeof OffscreenCanvas === 'function' &&
    typeof createImageBitmap === 'function'
  )
}

/**
 * Cut the person out of a photo.
 *
 * Steps: decode with EXIF orientation (a sideways phone photo segments as a
 * sideways person) → segment → refine the matte against the photo (drop the
 * background islands, fill the punched holes, snap the edge to the real
 * boundary — see portrait-matte.ts) → analyse it (coverage, head, side,
 * frame) → feather → multiply into the photo's alpha → encode.
 *
 * The refinement runs BEFORE the analysis on purpose: a leak twenty pixels
 * wide in the corner of the frame moves the measured head centre, and with it
 * the diamond crop and which side the member page puts their name on.
 */
export async function cutOutPortrait(file: File, opts: CutoutOptions = {}): Promise<CutoutResult> {
  if (!cutoutSupported()) {
    throw new CutoutUnavailableError('This browser cannot run the background remover.', 'unsupported')
  }
  const maxDim = opts.maxDim ?? 1024

  opts.onPhase?.('loading-model')
  let segmenter: Segmenter
  try {
    segmenter = await getSegmenter()
  } catch (err) {
    throw new CutoutUnavailableError(
      err instanceof Error && err.message ? err.message : 'The background remover could not be loaded.',
      'model'
    )
  }

  opts.onPhase?.('cutting')
  const source = await decodeImage(file)
  try {
    const srcW = source instanceof HTMLImageElement ? source.naturalWidth : source.width
    const srcH = source instanceof HTMLImageElement ? source.naturalHeight : source.height
    const { width, height } = fitDimensions(srcW, srcH, maxDim)

    const photo = new OffscreenCanvas(width, height)
    const pctx = photo.getContext('2d')
    if (!pctx) throw new CutoutUnavailableError('Canvas is unavailable.', 'unsupported')
    pctx.drawImage(source as CanvasImageSource, 0, 0, width, height)

    const result = segmenter.segment(photo)
    const mask = result.confidenceMasks?.[0]
    if (!mask) {
      result.close()
      throw new CutoutUnavailableError('The model returned no mask.', 'model')
    }
    const mw = mask.width
    const mh = mask.height
    const raw = mask.getAsFloat32Array()
    // getAsFloat32Array can hand back a view onto WASM memory that result.close()
    // frees, and the refinement reads it long after. Copy first.
    const data = Float32Array.from(raw)
    result.close()

    opts.onPhase?.('refining')
    // The photo at the mask's resolution, in grey, is the guide the edge is
    // snapped to. The segmenter returns a mask the size of its input, so this
    // is normally the same canvas — but it is documented as "matches input",
    // not guaranteed, so rescale when it does not.
    let guide: Float32Array | null = null
    try {
      const source =
        mw === width && mh === height
          ? pctx.getImageData(0, 0, width, height)
          : scaleToImageData(photo, mw, mh)
      if (source) guide = greyGuide(source.data)
    } catch {
      // A tainted canvas or an out-of-memory getImageData: the topology fixes
      // still run, only the edge-snapping is lost.
      guide = null
    }
    const refined = refineMatte(data, mw, mh, { guide })
    const analysis = analyseMask(refined.mask, mw, mh)

    // Alpha layer from the mask, at the mask's own resolution.
    const alpha = new OffscreenCanvas(mw, mh)
    const actx = alpha.getContext('2d')
    if (!actx) throw new CutoutUnavailableError('Canvas is unavailable.', 'unsupported')
    const image = actx.createImageData(mw, mh)
    const px = image.data
    for (let i = 0, j = 0; i < refined.mask.length; i++, j += 4) {
      px[j] = 255
      px[j + 1] = 255
      px[j + 2] = 255
      px[j + 3] = Math.round(refined.mask[i] * 255)
    }
    actx.putImageData(image, 0, 0)

    if (!coverageIsPlausible(analysis.coverage)) {
      throw new CutoutUnavailableError(
        analysis.coverage < 0.5
          ? 'No person could be found in that photo.'
          : 'That photo has no background to remove.',
        analysis.coverage < 0.5 ? 'nothing-found' : 'no-background'
      )
    }

    // Keep the photo only where the (feathered) mask is.
    pctx.globalCompositeOperation = 'destination-in'
    if ('filter' in pctx) pctx.filter = `blur(${FEATHER_PX}px)`
    pctx.drawImage(alpha, 0, 0, width, height)
    if ('filter' in pctx) pctx.filter = 'none'
    pctx.globalCompositeOperation = 'source-over'

    // Crop the air away. A cut-out that keeps the photo's canvas carries the
    // removed background as transparent margin, and every surface that draws
    // it `object-contain` centres the CANVAS — so a person who stood to one
    // side of their photo stands to one side of the hero's box, the flyer
    // starts off-centre, and the diamond and the standing figure disagree
    // about where the face is. Trimming to the alpha puts the person where the
    // box is. The pad keeps the feathered fringe: the blur above spread alpha
    // FEATHER_PX beyond the mask, so the mask's own bounds are a hair too
    // tight.
    const maskBounds = alphaBounds(refined.mask, mw, mh, 0.02, Math.ceil(FEATHER_PX * 3) + 1)
    let out: OffscreenCanvas = photo
    let outW = width
    let outH = height
    let finalAnalysis = analysis
    if (maskBounds && (maskBounds.w < mw || maskBounds.h < mh)) {
      const sx = width / mw
      const sy = height / mh
      const crop = {
        x: Math.floor(maskBounds.x * sx),
        y: Math.floor(maskBounds.y * sy),
        w: Math.min(width, Math.ceil(maskBounds.w * sx)),
        h: Math.min(height, Math.ceil(maskBounds.h * sy)),
      }
      crop.w = Math.min(crop.w, width - crop.x)
      crop.h = Math.min(crop.h, height - crop.y)
      if (crop.w > 0 && crop.h > 0) {
        const cropped = new OffscreenCanvas(crop.w, crop.h)
        const cctx = cropped.getContext('2d')
        if (cctx) {
          cctx.drawImage(photo, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
          out = cropped
          outW = crop.w
          outH = crop.h
          finalAnalysis = remapAnalysis(analysis, crop, width, height)
        }
      }
    }

    // Lossy WebP carries alpha; nothing downstream flattens it. Safari cannot
    // encode WebP from a canvas, so it gets PNG — bigger, still transparent.
    const cutout = await out.convertToBlob(
      canEncodeWebp() ? { type: 'image/webp', quality: 0.9 } : { type: 'image/png' }
    )

    return {
      ...finalAnalysis,
      cutout,
      width: outW,
      height: outH,
      strayPatches: refined.droppedComponents,
      strayPixels: refined.droppedPixels,
      filledHoles: refined.filledHoles,
    }
  } finally {
    if (!(source instanceof HTMLImageElement)) source.close()
  }
}

/** The photo redrawn at the mask's resolution, for the guided filter's guide. */
function scaleToImageData(photo: OffscreenCanvas, w: number, h: number): ImageData | null {
  const scaled = new OffscreenCanvas(w, h)
  const ctx = scaled.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(photo, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}
