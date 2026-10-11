import { PHRASES, type PhraseTable } from './phrases'

export type VoiceCommand =
  | { kind: 'navigate'; path: string; label: string }
  | { kind: 'back' | 'forward' }
  | { kind: 'scroll'; dir: 'up' | 'down' | 'top' | 'bottom' }
  | { kind: 'read'; what: 'page' | 'selection' }
  | { kind: 'stop' | 'pause' | 'resume' }
  | { kind: 'search'; query: string }
  | { kind: 'click'; label: string }
  | { kind: 'clickNumber'; n: number }
  | { kind: 'numbers'; show: boolean }
  | { kind: 'textSize'; dir: 'up' | 'down' | 'reset' }
  | { kind: 'heading'; dir: 'next' | 'prev' }
  | { kind: 'focus'; dir: 'next' | 'prev' }
  | { kind: 'activate' | 'help' | 'sleep' | 'panel' }

export interface VoiceRouteLike {
  path: string
  label: string
  voice?: string[]
}

export interface ParseOptions {
  routes?: VoiceRouteLike[]
  /** A bare number only means something while numbers are on screen */
  numbersVisible?: boolean
  tables?: Record<string, PhraseTable>
}

/** Lower case, no accents, no punctuation, single spaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const tableFor = (lang: string, tables: Record<string, PhraseTable>) =>
  tables[lang.toLowerCase().split(/[-_]/)[0]] ?? tables.en

function stripFiller(text: string, t: PhraseTable): string {
  let out = ` ${text} `
  let changed = true
  // Fillers at either end only: "the" inside "go to the forums" is not filler
  while (changed) {
    changed = false
    for (const f of t.filler) {
      const nf = normalize(f)
      if (out.startsWith(` ${nf} `)) {
        out = out.slice(nf.length + 1)
        changed = true
      }
      if (out.endsWith(` ${nf} `)) {
        out = out.slice(0, out.length - nf.length - 1)
        changed = true
      }
    }
  }
  return out.trim()
}

const exact = (text: string, list: string[]) => list.some((p) => normalize(p) === text)

/** Match "{x}" or "{n}" patterns; returns the slot text, or null. Articles go: "the grants" is "grants". */
function slot(text: string, patterns: string[], t: PhraseTable): string | null {
  for (const p of patterns) {
    const np = normalize(p.replace(/\{[xn]\}/, 'SLOTSLOT')).replace('slotslot', '\u0000')
    const [before, after] = np.split('\u0000')
    const b = before.trim()
    const a = (after ?? '').trim()
    if (b && !text.startsWith(b + ' ')) continue
    if (a && !text.endsWith(' ' + a)) continue
    const middle = text.slice(b ? b.length + 1 : 0, a ? text.length - a.length - 1 : text.length).trim()
    const bare = stripFiller(middle, t)
    if (bare) return bare
  }
  return null
}

export function parseNumber(text: string, t: PhraseTable): number | null {
  if (/^\d{1,3}$/.test(text)) return Number(text)
  return t.numbers[text] ?? null
}

/** Levenshtein distance, capped: only "close enough" matters. */
function distance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** The route a spoken name means: exact, then near-miss for words long enough to judge. */
export function matchRoute<R extends VoiceRouteLike>(spoken: string, routes: R[]): R | null {
  const s = normalize(spoken)
  const names = routes.flatMap((r) => [r.label, ...(r.voice ?? [])].map((n) => ({ r, n: normalize(n) })))
  const hit = names.find((x) => x.n === s) ?? names.find((x) => s.length >= 4 && (x.n.startsWith(s) || s.startsWith(x.n)))
  if (hit) return hit.r
  let best: { r: R; d: number } | null = null
  for (const { r, n } of names) {
    if (n.length < 4) continue
    const d = distance(s, n)
    if (d <= 2 && (!best || d < best.d)) best = { r, d }
  }
  return best?.r ?? null
}

/**
 * Turn what someone said into a command, or null when it is not one.
 * Pure: everything it needs comes in, so every phrase is testable.
 */
export function parseVoiceCommand(said: string, lang: string, opts: ParseOptions = {}): VoiceCommand | null {
  const t = tableFor(lang, opts.tables ?? PHRASES)
  const text = stripFiller(normalize(said), t)
  if (!text) return null

  // A bare number, while numbers are showing
  if (opts.numbersVisible) {
    const n = parseNumber(text, t)
    if (n !== null) return { kind: 'clickNumber', n }
  }

  // Fixed phrases. Order matters where one is a prefix of another
  const fixed: [keyof PhraseTable, VoiceCommand][] = [
    ['sleep', { kind: 'sleep' }],
    ['help', { kind: 'help' }],
    ['panel', { kind: 'panel' }],
    ['readSelection', { kind: 'read', what: 'selection' }],
    ['readPage', { kind: 'read', what: 'page' }],
    ['pause', { kind: 'pause' }],
    ['resume', { kind: 'resume' }],
    ['stop', { kind: 'stop' }],
    ['showNumbers', { kind: 'numbers', show: true }],
    ['hideNumbers', { kind: 'numbers', show: false }],
    ['textReset', { kind: 'textSize', dir: 'reset' }],
    ['textUp', { kind: 'textSize', dir: 'up' }],
    ['textDown', { kind: 'textSize', dir: 'down' }],
    ['nextHeading', { kind: 'heading', dir: 'next' }],
    ['prevHeading', { kind: 'heading', dir: 'prev' }],
    ['top', { kind: 'scroll', dir: 'top' }],
    ['bottom', { kind: 'scroll', dir: 'bottom' }],
    ['scrollDown', { kind: 'scroll', dir: 'down' }],
    ['scrollUp', { kind: 'scroll', dir: 'up' }],
    ['back', { kind: 'back' }],
    ['forward', { kind: 'forward' }],
    ['activate', { kind: 'activate' }],
    ['next', { kind: 'focus', dir: 'next' }],
    ['prev', { kind: 'focus', dir: 'prev' }],
  ]
  for (const [key, cmd] of fixed) if (exact(text, t[key] as string[])) return cmd

  const numbered = slot(text, t.clickNumber, t)
  if (numbered !== null) {
    const n = parseNumber(numbered, t)
    if (n !== null) return { kind: 'clickNumber', n }
  }

  const query = slot(text, t.search, t)
  if (query) return { kind: 'search', query }

  const clicked = slot(text, t.click, t)
  if (clicked) return { kind: 'click', label: clicked }

  const routes = opts.routes ?? []
  const place = slot(text, t.navigate, t)
  if (place) {
    const route = matchRoute(place, routes)
    if (route) return { kind: 'navigate', path: route.path, label: route.label }
    return { kind: 'click', label: place }
  }

  const opened = slot(text, t.open, t)
  if (opened) {
    const route = matchRoute(opened, routes)
    if (route) return { kind: 'navigate', path: route.path, label: route.label }
    return { kind: 'click', label: opened }
  }

  // Just a page name, said on its own
  const route = routes.length ? matchRoute(text, routes) : null
  if (route) return { kind: 'navigate', path: route.path, label: route.label }
  return null
}
