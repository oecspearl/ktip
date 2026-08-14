/**
 * De-obfuscation for the advisory pass.
 *
 * scan_content() does none of this — it matches the text as written. So
 * anything only this pass finds would sail straight through the server, and
 * blocking on it would strand a member with a draft the platform would happily
 * have accepted. Everything here therefore feeds `via: 'normalized'` matches,
 * which warn and never block.
 *
 * The output carries a per-character map back to the original string, because
 * the strikethrough needs to cover the characters the member actually typed —
 * `b.a.d` must strike all five, not three. Re-searching the original after the
 * fact cannot reconstruct that; the map falls out of the transform for free.
 */

/**
 * Punctuation that separates obfuscated letters. Dropped whenever it sits
 * between two alphanumerics, so `b.o.g.u.s` and `cra.p` both collapse.
 */
const PUNCT_SEPARATORS = new Set(['.', '-', '_', '*', "'", '"', ',', '/', '\\', '+', '~', '`'])

/**
 * Whitespace is the dangerous one. Dropping it between alphanumerics would
 * turn every sentence into one word — "Are you there" becomes "areyouthere",
 * and the term list starts matching across word boundaries that a member never
 * wrote. So a space is only dropped when it sits between two SINGLE letters,
 * which is the shape of `f u c k` and is not the shape of prose.
 */
const SPACE = new Set([' ', '\t'])

/**
 * Homoglyph folding. Kept small and behind a constant: every entry here is a
 * false-positive engine on a platform whose content is technical project
 * descriptions and grant budgets (1 → i turns H1N1 into hini, 4 → a turns C4
 * into ca). Trim this list first if the false-positive rate is bad.
 */
const CONFUSABLES: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
  // Not a homoglyph — a fold JS toLowerCase() does not perform. Kept here so
  // the one-source-char-to-many-output-chars path has a real caller.
  ß: 'ss',
}

const COMBINING = /\p{M}/u
const FORMAT = /[\p{Cf}­]/u
const ALNUM = /[\p{L}\p{N}]/u

export interface Normalized {
  text: string
  /** map[j] = start offset in the original of the char that produced text[j]. */
  map: Int32Array
  /** endMap[j] = exclusive end offset in the original. Not always map[j] + 1 — a
   *  surrogate pair is two UTF-16 units and one source character. */
  endMap: Int32Array
}

export function normalizeForMatching(input: string): Normalized {
  const chars: string[] = []
  const starts: number[] = []
  const ends: number[] = []

  // Pass A — per source character: decompose, strip marks, lowercase, drop
  // invisible formatting, fold homoglyphs.
  let offset = 0
  for (const ch of input) {
    const width = ch.length
    const start = offset
    offset += width

    if (FORMAT.test(ch)) continue

    let folded = ch.normalize('NFKD')
    let stripped = ''
    for (const c of folded) if (!COMBINING.test(c)) stripped += c
    if (stripped === '') continue

    stripped = stripped.toLowerCase()
    const mapped = CONFUSABLES[stripped]
    if (mapped) stripped = mapped

    // One source char may yield several output chars (ß → ss). Each points at
    // the same source span, so a range built from map[start]..endMap[end-1]
    // still covers exactly the characters the member typed.
    for (const c of stripped) {
      chars.push(c)
      starts.push(start)
      ends.push(start + width)
    }
  }

  // Pass B — drop separators sitting between alphanumerics. Whitespace needs
  // the run lengths on either side, so measure them first.
  const runBefore = new Int32Array(chars.length)
  const runAfter = new Int32Array(chars.length)
  for (let i = 1; i < chars.length; i++) {
    runBefore[i] = ALNUM.test(chars[i - 1]) ? runBefore[i - 1] + 1 : 0
  }
  for (let i = chars.length - 2; i >= 0; i--) {
    runAfter[i] = ALNUM.test(chars[i + 1]) ? runAfter[i + 1] + 1 : 0
  }

  const bChars: string[] = []
  const bStarts: number[] = []
  const bEnds: number[] = []
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    const between = runBefore[i] >= 1 && runAfter[i] >= 1
    const dropped =
      between &&
      (PUNCT_SEPARATORS.has(c) || (SPACE.has(c) && runBefore[i] === 1 && runAfter[i] === 1))
    if (dropped) continue
    bChars.push(c)
    bStarts.push(starts[i])
    bEnds.push(ends[i])
  }

  // Pass C — collapse runs of three or more of the same character down to two,
  // so `baaaad` matches `bad`-adjacent rules while `aardvark` survives intact.
  const cChars: string[] = []
  const cStarts: number[] = []
  const cEnds: number[] = []
  let run = 0
  for (let i = 0; i < bChars.length; i++) {
    run = i > 0 && bChars[i] === bChars[i - 1] ? run + 1 : 0
    if (run >= 2) {
      // Absorbed into the previous output char so the range still spans it.
      if (cEnds.length > 0) cEnds[cEnds.length - 1] = bEnds[i]
      continue
    }
    cChars.push(bChars[i])
    cStarts.push(bStarts[i])
    cEnds.push(bEnds[i])
  }

  return {
    text: cChars.join(''),
    map: Int32Array.from(cStarts),
    endMap: Int32Array.from(cEnds),
  }
}

/** True when normalizing changed nothing, so the advisory pass can be skipped. */
export function isUnchanged(input: string, normalized: Normalized): boolean {
  return input.toLowerCase() === normalized.text
}
