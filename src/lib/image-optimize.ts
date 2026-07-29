/**
 * Client-side image optimization.
 *
 * Downscales and re-encodes uploads to WebP in the browser before they reach
 * Supabase Storage. Every image bucket already allows `image/webp`, so no
 * migration is required.
 *
 * The module degrades gracefully: anything it cannot safely convert (SVG,
 * animated GIF, a browser without WebP encoding) is returned untouched.
 */

export interface OptimizeOptions {
  /** Cap on the longest edge, in pixels. */
  maxDim: number
  /** Initial WebP quality, 0–1. */
  quality: number
  /** Optional hard target; quality steps down to try to reach it. */
  maxBytes?: number
}

/** Thrown when the browser cannot decode the file at all (e.g. HEIC outside Safari). */
export class UnsupportedImageError extends Error {
  constructor(message = "Couldn't read that image. Try JPG, PNG, or WebP.") {
    super(message)
    this.name = 'UnsupportedImageError'
  }
}

/** Quality steps tried, in order, when the first encode overshoots `maxBytes`. */
const QUALITY_LADDER = [0.7, 0.6, 0.5]

/**
 * Formats we deliberately never touch:
 * - SVG: rasterizing a vector is a downgrade.
 * - GIF: canvas keeps only the first frame, silently destroying animation.
 */
const SKIP_TYPES = ['image/svg+xml', 'image/gif']

let webpSupport: boolean | null = null

/** Probe (memoized) whether this browser can encode WebP from a canvas. */
export function canEncodeWebp(): boolean {
  if (webpSupport !== null) return webpSupport
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpSupport = false
  }
  return webpSupport
}

/** True when the file should be uploaded as-is, with no conversion attempted. */
export function shouldSkipOptimization(file: File): boolean {
  if (!file.type.startsWith('image/')) return true
  return SKIP_TYPES.includes(file.type)
}

/**
 * Scale so the longest edge is at most `maxDim`, preserving aspect ratio.
 * Never upscales.
 */
export function fitDimensions(
  width: number,
  height: number,
  maxDim: number
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= 0) return { width: 0, height: 0 }

  const scale = Math.min(1, maxDim / longest)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Replace the trailing extension with `.webp` (appends if there is none). */
export function renameToWebp(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, '')
  return `${base || 'image'}.webp`
}

/** Lowercase extension of a filename, or `'webp'` if it has none. */
export function extensionOf(fileName: string): string {
  const match = /\.([^./\\]+)$/.exec(fileName)
  return match ? match[1].toLowerCase() : 'webp'
}

/**
 * Decode a file to a bitmap, applying EXIF orientation so phone photos are not
 * rotated sideways.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Fall through to the <img> path below.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new UnsupportedImageError())
      img.src = url
    })
  } catch {
    throw new UnsupportedImageError()
  } finally {
    URL.revokeObjectURL(url)
  }
}

type Drawable = ImageBitmap | HTMLImageElement

function sizeOf(source: Drawable): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight }
  }
  return { width: source.width, height: source.height }
}

/** Draw at the target size and encode to WebP at the given quality. */
async function encode(
  source: Drawable,
  width: number,
  height: number,
  quality: number
): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'function') {
    try {
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)
      return await canvas.convertToBlob({ type: 'image/webp', quality })
    } catch {
      // Fall through to the HTMLCanvasElement path below.
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality)
  })
}

/**
 * Downscale + convert an image to WebP.
 *
 * Returns the original `File` untouched when conversion is unsafe, unsupported,
 * or would not actually save bytes. Throws `UnsupportedImageError` only when the
 * browser cannot decode the file at all.
 */
export async function optimizeImage(file: File, opts: OptimizeOptions): Promise<File> {
  if (shouldSkipOptimization(file) || !canEncodeWebp()) return file

  const source = await decode(file)
  try {
    const { width: srcW, height: srcH } = sizeOf(source)
    if (!srcW || !srcH) return file

    const { width, height } = fitDimensions(srcW, srcH, opts.maxDim)

    let best = await encode(source, width, height, opts.quality)
    if (best && opts.maxBytes) {
      for (const quality of QUALITY_LADDER) {
        if (best.size <= opts.maxBytes) break
        const next = await encode(source, width, height, quality)
        if (!next) break
        if (next.size < best.size) best = next
      }
    }

    // Never regress: an already-optimized upload stays as it is.
    if (!best || best.size >= file.size) return file

    return new File([best], renameToWebp(file.name), {
      type: 'image/webp',
      lastModified: file.lastModified,
    })
  } finally {
    if (!(source instanceof HTMLImageElement)) source.close()
  }
}
