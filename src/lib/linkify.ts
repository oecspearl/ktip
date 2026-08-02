/**
 * Turning URLs typed into a message into things you can actually click.
 *
 * Chat is where links live — an invitation mail-out, a shared whiteboard, a
 * grant page someone wants a second opinion on. Rendered as plain text they
 * are a copy-paste chore, and the copy usually goes wrong because the URL sits
 * at the end of a sentence and the period comes along with it.
 *
 * This module is deliberately a *tokenizer*, not an HTML generator: it returns
 * plain data and the React layer decides what an anchor looks like. Nothing
 * here builds markup, so there is no way for message text to smuggle an
 * element into the page.
 *
 * Links that point back at this site come back with an `internal` path so the
 * UI can route them through the SPA rather than reloading the whole app — a
 * whiteboard invitation should open the whiteboard, not boot the site again.
 */

export type LinkToken =
  | { kind: 'text'; text: string }
  | {
      kind: 'link'
      /** What the author typed, shown as-is. */
      text: string
      /** Absolute, always http(s). `www.foo` gains the scheme. */
      href: string
      /** `/path?query#hash` when this points at our own site, else null. */
      internal: string | null
    }

/**
 * Hosts that are this platform wherever the app happens to be running. The
 * current origin is added at match time — on a preview deploy or localhost a
 * link to the production host is still "our" link, and routing it internally
 * keeps the reader inside the environment they are already in.
 */
const SITE_HOSTS = new Set(['oecsinnovation.org', 'www.oecsinnovation.org'])

/** Bare `www.` is included: people paste it constantly and mean https. */
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>]+/gi

/** Sentence punctuation that is almost never part of the URL itself. */
const TRAILING_PUNCTUATION = '.,;:!?"\'’”'

const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function occurrences(text: string, char: string): number {
  let n = 0
  for (const c of text) if (c === char) n++
  return n
}

/**
 * Strip what the sentence contributed, not what the URL owns.
 *
 * A closing bracket only goes if it is unbalanced — `…/wiki/Ruby_(gem)` keeps
 * its paren, `(see https://x.org/a)` does not.
 */
export function trimUrlTail(raw: string): string {
  let url = raw

  while (url.length > 0) {
    const last = url[url.length - 1]

    if (TRAILING_PUNCTUATION.includes(last)) {
      url = url.slice(0, -1)
      continue
    }

    const opener = CLOSERS[last]
    if (opener && occurrences(url, opener) < occurrences(url, last)) {
      url = url.slice(0, -1)
      continue
    }

    break
  }

  return url
}

function currentHost(): string | null {
  if (typeof window === 'undefined') return null
  return window.location?.host || null
}

/**
 * `/path?query#hash` when the URL is one of ours, else null.
 *
 * Anything that fails to parse is treated as external — a link the router
 * cannot resolve is better opened as a URL than routed into a 404.
 */
export function internalPath(href: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(href)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const here = currentHost()
  const isOurs = SITE_HOSTS.has(parsed.host.toLowerCase()) || (here !== null && parsed.host === here)
  if (!isOurs) return null

  return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/'
}

/**
 * Split a message into text and link tokens, in order. Concatenating every
 * token's `text` reproduces the input exactly — nothing is dropped, so a URL
 * we decline to linkify still shows up as the words the author wrote.
 */
export function linkify(input: string): LinkToken[] {
  const tokens: LinkToken[] = []
  if (!input) return tokens

  let cursor = 0
  URL_PATTERN.lastIndex = 0

  for (const match of input.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0
    const matched = match[0]
    const url = trimUrlTail(matched)

    // Trimmed down to a bare scheme or `www.` — not a link, just punctuation.
    if (!/^(?:https?:\/\/|www\.)\S+/i.test(url) || /^https?:\/\/$/i.test(url)) continue

    if (start > cursor) {
      tokens.push({ kind: 'text', text: input.slice(cursor, start) })
    }

    const href = /^www\./i.test(url) ? `https://${url}` : url
    tokens.push({ kind: 'link', text: url, href, internal: internalPath(href) })

    cursor = start + url.length
  }

  if (cursor < input.length) {
    tokens.push({ kind: 'text', text: input.slice(cursor) })
  }

  return tokens
}

/** Whether a string contains anything worth rendering as a link. */
export function hasLink(input: string): boolean {
  return linkify(input).some((token) => token.kind === 'link')
}
