/**
 * The Submission Desk's "still missing" list (migration 192).
 *
 * submission_missing() in 192 is the copy that decides whether Submit goes
 * through. This one draws the list as the team types, before anything is
 * saved, so it must give the same answer for the same entry. The codes match.
 */

export type MissingCode =
  | 'title'
  | 'summary'
  | 'repo'
  | 'video'
  | 'video_length'
  | 'deck'
  | 'ai'
  | `evidence:${string}`

export interface ChecklistEntry {
  title?: string | null
  description?: string | null
  repo_url?: string | null
  demo_video_url?: string | null
  demo_video_seconds?: number | null
  pitch_deck_url?: string | null
  pitch_deck_path?: string | null
  ai_use?: string | null
}

export interface ChecklistCriterion {
  id: string
  kind: string
  is_required: boolean
}

export interface ChecklistEvidence {
  criterion_id: string
  note?: string | null
  url?: string | null
}

/** Longest demo video the desk accepts, in seconds. Matches the CHECK in 192. */
export const MAX_VIDEO_SECONDS = 180

const blank = (v: string | null | undefined) => !v || !v.trim()

export function submissionMissing(
  entry: ChecklistEntry | null | undefined,
  criteria: ChecklistCriterion[],
  evidence: ChecklistEvidence[]
): MissingCode[] {
  if (!entry) return ['title']
  const out: MissingCode[] = []

  if (blank(entry.title)) out.push('title')
  if (blank(entry.description)) out.push('summary')
  if (blank(entry.repo_url)) out.push('repo')
  if (blank(entry.demo_video_url)) out.push('video')
  else if (entry.demo_video_seconds == null) out.push('video_length')
  if (blank(entry.pitch_deck_url) && blank(entry.pitch_deck_path)) out.push('deck')
  if (blank(entry.ai_use)) out.push('ai')

  const answered = new Set(
    evidence.filter((e) => !blank(e.note) || !blank(e.url)).map((e) => e.criterion_id)
  )
  for (const c of criteria) {
    if ((c.kind === 'objective' || c.kind === 'deliverable') && c.is_required && !answered.has(c.id)) {
      out.push(`evidence:${c.id}`)
    }
  }
  return out
}

/** "2:45" or "165" → 165. Null for anything else. */
export function parseDuration(text: string): number | null {
  const s = text.trim()
  if (!s) return null
  const mmss = /^(\d{1,2}):([0-5]\d)$/.exec(s)
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2])
  if (/^\d{1,4}$/.test(s)) return Number(s)
  return null
}

/** 165 → "2:45". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return ''
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** http(s) only, the same rule as the CHECK constraints in 192. */
export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * A storage key the database will accept for a deck: <entry id>/<name>, with
 * the name reduced to letters, digits, dot, dash and underscore.
 */
export function deckObjectPath(entryId: string, fileName: string, stamp = Date.now()): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+/, '').slice(-120) || 'deck'
  return `${entryId}/${stamp.toString(36)}-${safe}`
}
