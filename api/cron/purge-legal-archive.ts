import { createClient } from '@supabase/supabase-js'
import { authorizeCron } from '../_lib/cron-auth'
import { removeArchivedObjects, type ArchivedObject } from '../_lib/legal-archive'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Ends the 3-year legal archive (migration 187).
 *
 * Every deleted project, message, application and the rest sits in
 * legal_archive for 3 years. This is the job that makes "3 years" true: a
 * retention period nobody enforces is an indefinite one. Rows on legal hold are
 * skipped by purge_legal_archive() itself.
 *
 * ORDER. The function deletes the rows and returns their files; this route then
 * removes the files from the legal-archive bucket. If a removal fails the
 * paths would be lost with the row, so they are written back as a
 * `storage_purge_retry` row due immediately, and tomorrow's run tries again.
 *
 * BATCHES of 500, at most 10 per run, so one run stays well inside the edge
 * time limit. A backlog bigger than that drains over the following days.
 *
 * AUTH: the shared CRON_SECRET check (api/_lib/cron-auth.ts), the same one
 * purge-accounts uses.
 */

const BATCH = 500
const MAX_BATCHES = 10

interface PurgedRow {
  id: string
  entity_type: string
  storage_paths: ArchivedObject[] | null
}

export default async function handler(req: Request): Promise<Response> {
  const auth = authorizeCron(req)
  if (!auth.ok) return auth.response

  const admin = createClient(auth.supabaseUrl, auth.serviceKey)

  let purged = 0
  let filesRemoved = 0
  const failed: { id: string; step: string; detail: string }[] = []

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await admin.rpc('purge_legal_archive', { p_limit: BATCH })
    if (error) {
      return json(
        { error: 'could not purge the legal archive', detail: error.message, purged, filesRemoved, failed },
        502
      )
    }

    const rows = (data || []) as PurgedRow[]
    purged += rows.length

    for (const row of rows) {
      const files = Array.isArray(row.storage_paths) ? row.storage_paths : []
      if (files.length === 0) continue

      const outcome = await removeArchivedObjects(admin, files)
      filesRemoved += outcome.removed
      if (outcome.failed.length === 0) continue

      // Keep the paths, or nothing will ever come back for these files.
      const { error: retryError } = await admin.from('legal_archive').insert({
        entity_type: 'storage_purge_retry',
        entity_id: row.id,
        snapshot: { purged_entity_type: row.entity_type, detail: outcome.detail },
        storage_paths: outcome.failed,
        reason: 'storage_purge_retry',
        purge_after: new Date().toISOString(),
      })
      failed.push({
        id: row.id,
        step: retryError ? 'storage-remove-and-retry-record' : 'storage-remove',
        detail: retryError ? `${outcome.detail}; ${retryError.message}` : outcome.detail || 'remove failed',
      })
    }

    if (rows.length < BATCH) break
  }

  return json(
    { ok: failed.length === 0, purged, filesRemoved, failed },
    failed.length === 0 ? 200 : 207
  )
}
