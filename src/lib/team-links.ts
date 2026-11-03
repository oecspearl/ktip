/**
 * Validation for a team's outside links (migration 195). Mirrors the CHECK
 * constraints there, so a typo is caught in the form rather than by Postgres.
 */

export interface TeamLinks {
  github_repo: string | null
  discord_url: string | null
  zoom_url: string | null
  notion_url: string | null
}

export const EMPTY_LINKS: TeamLinks = { github_repo: null, discord_url: null, zoom_url: null, notion_url: null }

/**
 * "owner/name" from whatever the team pasted: a full GitHub URL, a clone URL,
 * or owner/name itself. Null if it is not a repository.
 */
export function parseGithubRepo(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const m = raw
    .replace(/^git@github\.com:/i, '')
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
    .match(/^([A-Za-z0-9_.-]{1,39})\/([A-Za-z0-9_.-]{1,100})(\/.*)?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

const RULES: Record<'discord_url' | 'zoom_url' | 'notion_url', RegExp> = {
  discord_url: /^https:\/\/(discord\.gg|discord\.com)\//i,
  zoom_url: /^https:\/\/([a-z0-9-]+\.)?zoom\.us\//i,
  notion_url: /^https:\/\/([a-z0-9-]+\.)?(notion\.so|notion\.site)\//i,
}

/** The cleaned link, null when empty, or false when it is the wrong kind of link. */
export function cleanLink(kind: keyof typeof RULES, input: string): string | null | false {
  const v = input.trim()
  if (!v) return null
  return RULES[kind].test(v) ? v : false
}
