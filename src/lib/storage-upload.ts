import { supabase } from './supabase'
import { IMAGE_PRESETS } from './constants'
import { extensionOf, optimizeImage } from './image-optimize'
import { checkImage, shouldScanImage } from './moderation/image-gate'

/**
 * Shared Supabase Storage upload helpers.
 *
 * Uploads whose object key is derived from the source file extension change key
 * when a JPEG is converted to WebP (`avatar.jpg` → `avatar.webp`). These helpers
 * keep that transition clean: the stale object is removed and the public URL is
 * cache-busted.
 */

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp']

/**
 * Buckets the image safety check covers. Deliberately the ones whose contents
 * are shown to other members — a verification document or a signed contract is
 * private, is read by a person already, and gains nothing from a vision call.
 */
const MODERATED_BUCKETS = new Set(['avatars', 'project-images', 'event-images'])

/**
 * Best-effort removal of the same logical image stored under a different
 * extension. Failures are ignored — an orphaned object is not worth failing an
 * otherwise successful upload over.
 */
export async function removeStaleVariants(
  bucket: string,
  basePath: string,
  keepExtension: string
): Promise<void> {
  const stale = IMAGE_EXTENSIONS.filter((ext) => ext !== keepExtension.toLowerCase()).map(
    (ext) => `${basePath}.${ext}`
  )

  try {
    await supabase.storage.from(bucket).remove(stale)
  } catch {
    // Ignore — cleanup is opportunistic.
  }
}

/**
 * Append a version query so browsers pick up a replaced object. Keys written
 * with `upsert: true` keep a stable public URL, which otherwise serves stale.
 */
export function cacheBust(url: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}v=${Date.now()}`
}

/**
 * Optimize and upload an image to a bucket at a key derived from `basePath`,
 * cleaning up any previous object stored under a different extension.
 * Returns a cache-busted public URL.
 */
export async function uploadOptimizedImage(params: {
  bucket: string
  /** Object key without extension. */
  basePath: string
  file: File
  preset: { maxDim: number; quality: number; maxBytes?: number }
  /** Run the image safety check. Default on for the buckets it covers. */
  moderate?: boolean
  /** Notified when the upload finishes and the check begins. */
  onPhase?: (phase: 'uploading' | 'checking') => void
}): Promise<string> {
  const { bucket, basePath, file, preset, onPhase } = params

  const optimized = await optimizeImage(file, preset)
  const extension = extensionOf(optimized.name)
  const filePath = `${basePath}.${extension}`

  const scanning =
    params.moderate !== false &&
    MODERATED_BUCKETS.has(bucket) &&
    shouldScanImage(optimized.type, optimized.size)

  // Staged under a throwaway key when it is going to be checked.
  //
  // This key is STABLE and the upload is upsert:true, so uploading straight to
  // it and deleting on a rejection would delete the member's PREVIOUS good
  // avatar and leave them with nothing — punishing them twice for one bad
  // file. Staging keeps the old object untouched until the new one passes.
  const stagedPath = scanning
    ? `${basePath}.pending-${Math.random().toString(36).slice(2, 8)}.${extension}`
    : filePath

  onPhase?.('uploading')
  const { error } = await supabase.storage
    .from(bucket)
    .upload(stagedPath, optimized, { upsert: true, contentType: optimized.type })

  if (error) throw error

  if (scanning) {
    onPhase?.('checking')
    const verdict = await checkImage(bucket, stagedPath)
    if (!verdict.ok) {
      await supabase.storage.from(bucket).remove([stagedPath])
      throw new Error(verdict.reason ?? 'That image cannot be used.')
    }
    const { error: moveError } = await supabase.storage.from(bucket).move(stagedPath, filePath)
    if (moveError) {
      await supabase.storage.from(bucket).remove([stagedPath])
      throw moveError
    }
  }

  await removeStaleVariants(bucket, basePath, extension)

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(filePath)

  return cacheBust(publicUrl)
}

/**
 * Optimize and upload an image for the document editor. Used by both the image
 * modal and the editor's drop/paste handler so they cannot drift apart.
 */
export async function uploadDocumentImage(file: File): Promise<string> {
  const optimized = await optimizeImage(file, IMAGE_PRESETS.DOCUMENT)
  const extension = extensionOf(optimized.name)
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  const filePath = `documents/${fileName}`

  const { error } = await supabase.storage
    .from('document-images')
    .upload(filePath, optimized, { upsert: true, contentType: optimized.type })

  if (error) throw error

  const {
    data: { publicUrl },
  } = supabase.storage.from('document-images').getPublicUrl(filePath)

  return publicUrl
}
