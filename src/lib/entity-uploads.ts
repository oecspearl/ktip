import { supabase } from './supabase'
import type { DocumentEntityType } from '../types'

/**
 * Cleaning up the `entity-documents` bucket when a grant or project is deleted.
 *
 * `entity_documents` is polymorphic — `entity_type` plus a bare `entity_id`
 * with no foreign key — so nothing cascades. Migration 077 adds a trigger that
 * reaps the rows, but the rows are only half of it: each one points at an
 * object in a private bucket, and Postgres cannot remove those. Deleting from
 * `storage.objects` in SQL drops the record Supabase lists the bucket from
 * while leaving the blob in the backing store, which is a worse orphan than
 * the one it fixes.
 *
 * So the blobs are the client's job, in this order:
 *
 *   1. ask the DB for the object keys   (before the parent is gone)
 *   2. delete the parent                (the trigger reaps the rows)
 *   3. remove the objects               (best effort)
 *
 * Order matters. Removing blobs first would, on a failed parent delete, leave
 * live document rows pointing at files that no longer exist — a download
 * button that 404s. This way the worst case is a few unreferenced bytes in a
 * private bucket, which is exactly the state the platform was already in.
 */

export const ENTITY_DOCUMENTS_BUCKET = 'entity-documents'

/**
 * Drop blanks and duplicates. `supabase.storage.remove([])` is a wasted round
 * trip, and a repeated key in the payload is a pointless retry.
 */
export function normalizeStoragePaths(paths: (string | null | undefined)[]): string[] {
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
 * Object keys of every upload attached to this grant or project.
 *
 * Goes through the `parent_upload_paths` RPC rather than selecting the table,
 * because a project owner cannot read the `storage_path` of a document a
 * collaborator uploaded privately — `get_entity_documents` withholds it and the
 * table's SELECT policy is per-document. The RPC is gated on whether the caller
 * could delete the *parent*, which is the right question here.
 *
 * Returns `[]` on any failure. A cleanup that cannot enumerate must not stop a
 * delete the user asked for.
 */
export async function listEntityUploadPaths(
  entityType: DocumentEntityType,
  entityId: string
): Promise<string[]> {
  try {
    const { data, error } = await (supabase as any).rpc('parent_upload_paths', {
      p_entity_type: entityType,
      p_entity_id: entityId,
    })
    if (error) throw error
    return normalizeStoragePaths(Array.isArray(data) ? data : [])
  } catch {
    return []
  }
}

/** Best effort. The rows are already gone; a stray object is not worth an error. */
export async function removeEntityUploads(paths: string[]): Promise<void> {
  const clean = normalizeStoragePaths(paths)
  if (clean.length === 0) return
  try {
    await supabase.storage.from(ENTITY_DOCUMENTS_BUCKET).remove(clean)
  } catch {
    // Ignore — see the module comment on ordering.
  }
}
