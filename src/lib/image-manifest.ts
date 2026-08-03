import manifest from 'virtual:image-manifest'
import { EMPTY_MANIFEST, type ImageEntry, type ImageManifest } from './image-variants'

/**
 * The one place the generated manifest is imported.
 *
 * Everything else takes a manifest as a parameter, so the lookup logic stays
 * pure and unit-testable without the virtual module — matching how
 * image-optimize.test.ts tests only the pure half of that module.
 */
export const IMAGE_MANIFEST: ImageManifest =
  manifest && typeof manifest === 'object' && manifest.images ? manifest : EMPTY_MANIFEST

/**
 * Looks a source path up in the manifest.
 *
 * Strips any query string first: storage-upload.ts appends `?v=<timestamp>` for
 * cache-busting, and DiscoverPage passes entity `image_url`s straight through,
 * so a key arriving with a query is normal rather than exceptional.
 */
export function lookupManifest(
  images: ImageManifest['images'],
  src: string
): ImageEntry | undefined {
  if (!src) return undefined
  const queryAt = src.search(/[?#]/)
  return images[queryAt === -1 ? src : src.slice(0, queryAt)]
}
