import { supabase } from './supabase'
import { IMAGE_PRESETS } from './constants'
import { extensionOf, optimizeImage } from './image-optimize'

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
}): Promise<string> {
  const { bucket, basePath, file, preset } = params

  const optimized = await optimizeImage(file, preset)
  const extension = extensionOf(optimized.name)
  const filePath = `${basePath}.${extension}`

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, optimized, { upsert: true, contentType: optimized.type })

  if (error) throw error

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
