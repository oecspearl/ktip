import { supabase } from './supabase'

/**
 * The `resource-files` bucket (migration 135).
 *
 * Private, read through signed URLs. A member submission sits in the review
 * queue before anyone else is meant to see it, and a public bucket would make
 * the file fetchable by anyone who guessed the object name the moment it
 * uploaded — before a reviewer had looked at it at all.
 *
 * Separate from `entity-documents` (048) rather than folded into it: that table
 * is polymorphic over `entity_type IN ('grant','project')` and widening the
 * CHECK to carry a third kind would mean every consumer of `get_entity_documents`
 * learns about resources. A resource has exactly one file, stored on the row.
 */
export const RESOURCE_FILES_BUCKET = 'resource-files'

/**
 * Object key: `{authorId}/{ts}_{safeName}`.
 *
 * The uid must be the first segment — the storage policies in 130 test
 * `(storage.foldername(name))[1] = auth.uid()::TEXT`, the same shape 035 and 048
 * use. `buildStoragePath` in document-extract.ts is not reusable here: it wants
 * an `entityType` and `entityId`, and the resource row does not exist yet when
 * the file goes up.
 */
export function buildResourceStoragePath(params: {
  authorId: string
  fileName: string
}): string {
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
  return `${params.authorId}/${Date.now()}_${safeName}`
}

/** Drop blanks and duplicates — an empty `remove([])` is a wasted round trip. */
export function normalizeResourcePaths(paths: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  for (const path of paths) {
    if (typeof path !== 'string') continue
    const trimmed = path.trim()
    if (trimmed.length === 0) continue
    seen.add(trimmed)
  }
  return [...seen]
}

/**
 * Best effort. Called when the row insert fails after the object is already up,
 * and when a submission is withdrawn. A stray object in a private bucket is a
 * smaller problem than an error thrown over cleanup the user did not ask for.
 */
export async function removeResourceUploads(paths: (string | null | undefined)[]): Promise<void> {
  const clean = normalizeResourcePaths(paths)
  if (clean.length === 0) return
  try {
    await supabase.storage.from(RESOURCE_FILES_BUCKET).remove(clean)
  } catch {
    // Ignore.
  }
}

/**
 * A time-limited URL for a private object.
 *
 * Returns null rather than throwing: a download button that cannot be signed
 * should render disabled, not take the page down with it.
 */
export async function signResourceFileUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(RESOURCE_FILES_BUCKET)
      .createSignedUrl(path, expiresInSeconds)
    if (error) throw error
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}
