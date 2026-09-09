/**
 * Bake a cut-out portrait onto its backdrop — the square every DiamondAvatar
 * reads as `avatar_url`.
 *
 * Kept apart from portrait-cutout.ts on purpose: changing backdrop (Phase 6 of
 * the plan) re-runs THIS with the stored cut-out and must not pull the 12 MB
 * vision chunk along with it.
 */

import { auroraLayout } from './banner'
import {
  avatarBackdropImage,
  avatarGradientSpec,
  type CutoutStyle,
} from './avatar-backdrop'
import { canEncodeWebp, decodeImage } from './image-optimize'
import { frameToPixels } from './portrait-mask'

export interface CompositeOptions {
  /** Output side, px. DiamondAvatar renders at 512 max. */
  size?: number
}

/**
 * Draw the aurora for a gradient style straight onto a canvas: base tint, then
 * each blob as a radial gradient screen-blended in. This is the static
 * `auroraCss()` formula, drawn rather than declared.
 */
export function drawAurora(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  style: Extract<CutoutStyle, { kind: 'gradient' }>,
  w: number,
  h: number
) {
  const { base, blobs } = auroraLayout(avatarGradientSpec(style))
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'screen'
  const big = Math.max(w, h)
  for (const b of blobs) {
    const cx = (b.cx / 100) * w
    const cy = (b.cy / 100) * h
    const r = (b.r / 100) * big * 1.4
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, b.color)
    g.addColorStop(0.12 / 1.4, b.color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  ctx.globalCompositeOperation = 'source-over'
}

async function fetchImage(url: string): Promise<ImageBitmap | HTMLImageElement> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Backdrop failed to load (${res.status})`)
  const blob = await res.blob()
  return decodeImage(new File([blob], 'backdrop', { type: blob.type }))
}

/**
 * Composite `cutout` (subject on transparency) over the style's backdrop,
 * cropped to the head frame, at `size`². Returns the encoded square.
 */
export async function compositeAvatar(
  cutout: Blob,
  style: CutoutStyle,
  opts: CompositeOptions = {}
): Promise<Blob> {
  const size = opts.size ?? 512
  const canvas = new OffscreenCanvas(size, size)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable.')

  // Backdrop first.
  if (style.kind === 'gradient') {
    drawAurora(ctx, style, size, size)
  } else {
    const url = avatarBackdropImage(style)
    if (!url) throw new Error('Unknown backdrop.')
    const art = await fetchImage(url)
    try {
      // object-fit: cover, centred — the banner SVGs are wide, the avatar square.
      const aw = art instanceof HTMLImageElement ? art.naturalWidth : art.width
      const ah = art instanceof HTMLImageElement ? art.naturalHeight : art.height
      const scale = Math.max(size / aw, size / ah)
      const dw = aw * scale
      const dh = ah * scale
      ctx.drawImage(art as CanvasImageSource, (size - dw) / 2, (size - dh) / 2, dw, dh)
    } finally {
      if (!(art instanceof HTMLImageElement)) art.close()
    }
  }

  // Then the person, framed to the head.
  const subject = await decodeImage(new File([cutout], 'cutout', { type: cutout.type }))
  try {
    const sw = subject instanceof HTMLImageElement ? subject.naturalWidth : subject.width
    const sh = subject instanceof HTMLImageElement ? subject.naturalHeight : subject.height
    const f = frameToPixels(style.frame, sw, sh)
    ctx.drawImage(subject as CanvasImageSource, f.x, f.y, f.s, f.s, 0, 0, size, size)
  } finally {
    if (!(subject instanceof HTMLImageElement)) subject.close()
  }

  return canvas.convertToBlob(canEncodeWebp() ? { type: 'image/webp', quality: 0.86 } : { type: 'image/jpeg', quality: 0.9 })
}
