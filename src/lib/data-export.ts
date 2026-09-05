import { supabase } from './supabase'

/**
 * "Download my data" — the portability half of the erasure conversation.
 *
 * Answering "can I have my data deleted" without also answering "can I have a
 * copy first" is half an answer, and the half that matters more to somebody
 * deciding whether to leave. This is the other half.
 *
 * EVERYTHING HERE IS READ AS THE MEMBER, through the ordinary client and the
 * ordinary policies. No service role, no export endpoint. That is a deliberate
 * limit as much as a convenience: the bundle can only ever contain what the
 * member could already read for themselves, so an export can never become a way
 * to read somebody else's row. Where a policy already hides something — another
 * member's half of a conversation, a moderation note about them — it stays
 * hidden here too, and `notes` in the bundle says so.
 *
 * A failed section does not fail the export. Somebody leaving because they are
 * upset should not be told "try again later" because one table was unreachable;
 * they get everything that answered, and a list of what did not.
 */

export interface ExportSection {
  key: string
  rows: unknown[]
}

export interface DataExport {
  generated_at: string
  user_id: string
  notes: string[]
  unavailable: { section: string; reason: string }[]
  data: Record<string, unknown>
}

interface SectionSpec {
  key: string
  table: string
  column: string
  /** Ordering column, when the table has one worth using. */
  order?: string
}

// One row per thing a member would expect to find in "my data". Ordered the way
// a person would look for them, not the way the schema grew.
const SECTIONS: SectionSpec[] = [
  { key: 'grant_applications', table: 'grant_applications', column: 'user_id', order: 'created_at' },
  { key: 'submitted_copies', table: 'submission_receipts', column: 'user_id', order: 'submitted_at' },
  { key: 'projects', table: 'projects', column: 'owner_id', order: 'created_at' },
  { key: 'events', table: 'events', column: 'organizer_id', order: 'created_at' },
  { key: 'funding_calls_posted', table: 'grants', column: 'created_by', order: 'created_at' },
  { key: 'forum_posts', table: 'forum_posts', column: 'author_id', order: 'created_at' },
  { key: 'forum_replies', table: 'forum_replies', column: 'author_id', order: 'created_at' },
  { key: 'messages_sent', table: 'messages', column: 'sender_id', order: 'created_at' },
  { key: 'documents', table: 'entity_documents', column: 'owner_id', order: 'created_at' },
  { key: 'notifications', table: 'notifications', column: 'user_id', order: 'created_at' },
]

const NOTES = [
  'Everything in this file was read with your own account, so it contains what you can see and nothing more.',
  'Messages list the ones you sent. The replies you received belong to the conversation and to whoever wrote them.',
  'Documents are listed by name, type and size. The files themselves are downloaded from the pages they are attached to.',
  'A section missing from "data" is listed under "unavailable" with the reason. It was not silently dropped.',
]

/** Gathers the bundle. Never throws for a section that fails — see `unavailable`. */
export async function buildDataExport(userId: string): Promise<DataExport> {
  const bundle: DataExport = {
    generated_at: new Date().toISOString(),
    user_id: userId,
    notes: NOTES,
    unavailable: [],
    data: {},
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    bundle.unavailable.push({ section: 'profile', reason: profileError.message })
  } else {
    bundle.data.profile = profile
  }

  // Sequential rather than Promise.all: ten parallel reads from a phone on a
  // Caribbean connection is how you get a timeout instead of an export.
  for (const section of SECTIONS) {
    let query = (supabase as any).from(section.table).select('*').eq(section.column, userId)
    if (section.order) query = query.order(section.order, { ascending: true })

    const { data, error } = await query
    if (error) {
      bundle.unavailable.push({ section: section.key, reason: error.message })
      continue
    }
    bundle.data[section.key] = data || []
  }

  return bundle
}

/** `ktip-my-data-2026-09-04.json` — dated, so two exports never collide. */
export function exportFileName(now = new Date()): string {
  return `ktip-my-data-${now.toISOString().slice(0, 10)}.json`
}

/**
 * Hands the bundle to the browser as a file.
 *
 * The object URL is revoked on the next tick rather than immediately: Safari
 * cancels a download whose blob URL is revoked in the same frame as the click.
 */
export function downloadJson(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
