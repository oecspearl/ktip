import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Files half of the 3-year legal archive (migration 187).
 *
 * Rows are archived by a BEFORE DELETE trigger, which cannot touch storage.
 * Files therefore have to be moved by whichever server path deletes them:
 * call archiveObjects() INSTEAD of `storage.remove()`. The objects move to the
 * private `legal-archive` bucket under `<original bucket>/<original path>`, and
 * the new paths are recorded on the matching legal_archive row so that
 * api/cron/purge-legal-archive.ts removes them when the row's 3 years are up.
 *
 * WHERE IT IS USED TODAY: nowhere yet, by design. None of the server delete
 * paths (api/delete-account.ts, api/admin/delete-user.ts, purge_account via
 * api/cron/purge-accounts.ts) remove storage objects at present, so there was
 * no remove() to replace, and adding file handling to them is a separate
 * decision. The member-side removals (src/lib/entity-uploads.ts,
 * useDeleteDocument) run in the browser, which cannot reach this bucket; they
 * need a server route before they can archive instead of delete.
 *
 * Service-role client only. The bucket has no storage policies.
 */

export const LEGAL_ARCHIVE_BUCKET = 'legal-archive'

/** One entry of legal_archive.storage_paths. */
export interface ArchivedObject {
  bucket: string
  path: string
}

/** The legal_archive row the files belong to: entity_type and entity_id, as the trigger wrote them. */
export interface ArchiveEntity {
  /** The source table name, e.g. 'projects' or 'entity_documents'. */
  type: string
  id: string
  ownerId?: string | null
}

export interface ArchiveObjectsResult {
  moved: ArchivedObject[]
  /** Objects that could not be moved. They are left where they were, never deleted. */
  failed: { path: string; detail: string }[]
  /** Set when the move worked but the paths could not be written to legal_archive. */
  recordError: string | null
}

function cleanPaths(paths: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  for (const raw of paths) {
    const path = (raw ?? '').trim().replace(/^\/+/, '')
    if (path) seen.add(path)
  }
  return [...seen]
}

/** A move of something already gone is not a failure: there is nothing to keep. */
function isMissing(message: string): boolean {
  return /not found|does not exist|no such/i.test(message)
}

export async function archiveObjects(
  admin: SupabaseClient,
  bucket: string,
  paths: readonly (string | null | undefined)[],
  entity: ArchiveEntity
): Promise<ArchiveObjectsResult> {
  const result: ArchiveObjectsResult = { moved: [], failed: [], recordError: null }

  for (const path of cleanPaths(paths)) {
    const destination = `${bucket}/${path}`
    const { error } = await admin.storage
      .from(bucket)
      .move(path, destination, { destinationBucket: LEGAL_ARCHIVE_BUCKET })

    if (error) {
      if (!isMissing(error.message)) result.failed.push({ path, detail: error.message })
      continue
    }
    result.moved.push({ bucket: LEGAL_ARCHIVE_BUCKET, path: destination })
  }

  if (result.moved.length === 0) return result

  // The trigger has normally written the row already (the delete ran first).
  // Newest first, in case the same id was archived more than once.
  const { data: existing, error: readError } = await admin
    .from('legal_archive')
    .select('id, storage_paths')
    .eq('entity_type', entity.type)
    .eq('entity_id', entity.id)
    .order('deleted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (readError) {
    result.recordError = readError.message
    return result
  }

  if (existing) {
    const current = Array.isArray(existing.storage_paths) ? (existing.storage_paths as ArchivedObject[]) : []
    const { error } = await admin
      .from('legal_archive')
      .update({ storage_paths: [...current, ...result.moved] })
      .eq('id', existing.id)
    if (error) result.recordError = error.message
    return result
  }

  // No row: the files belong to something that is not itself archived (an
  // avatar, say). Give them a row of their own so the purge still finds them.
  const { error } = await admin.from('legal_archive').insert({
    entity_type: entity.type,
    entity_id: entity.id,
    owner_id: entity.ownerId ?? null,
    snapshot: { source_bucket: bucket, files: result.moved.map((o) => o.path) },
    storage_paths: result.moved,
    reason: 'files',
  })
  if (error) result.recordError = error.message
  return result
}

/**
 * Removes archived objects for good. Only entries in the legal-archive bucket
 * are touched: a malformed storage_paths entry must never delete a live file.
 */
export async function removeArchivedObjects(
  admin: SupabaseClient,
  entries: readonly ArchivedObject[]
): Promise<{ removed: number; failed: ArchivedObject[]; detail: string | null }> {
  const paths = cleanPaths(
    entries.filter((e) => e && e.bucket === LEGAL_ARCHIVE_BUCKET).map((e) => e.path)
  )
  let removed = 0
  const failed: ArchivedObject[] = []
  let detail: string | null = null

  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100)
    const { error } = await admin.storage.from(LEGAL_ARCHIVE_BUCKET).remove(chunk)
    if (error) {
      detail = error.message
      failed.push(...chunk.map((path) => ({ bucket: LEGAL_ARCHIVE_BUCKET, path })))
      continue
    }
    removed += chunk.length
  }

  return { removed, failed, detail }
}
