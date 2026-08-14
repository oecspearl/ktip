import { compileForLint } from './scan'

/**
 * Validate a moderator-authored pattern BEFORE it is saved.
 *
 * This is the real defence against a pathological regex, not the read-path
 * time budget. Every active rule runs on every keystroke, on the UI thread,
 * against whatever the member is typing — so `(a+)+b` saved once freezes the
 * composer for everybody, forever, and the budget check only notices after the
 * frame is already gone.
 *
 * Validating on write costs one 50 ms check by one admin. Validating on read
 * costs every member every keystroke.
 */

export interface LintResult {
  ok: boolean
  /** Fatal — refuse the save. */
  error?: string
  /** Non-fatal, worth saying out loud. */
  warning?: string
}

/** Long enough that a linear pattern finishes instantly and a quadratic one does not. */
const ADVERSARIAL = 'a'.repeat(2000) + '!'
const BUDGET_MS = 50

/**
 * Nested quantifiers, the shape behind almost every catastrophic case:
 * a repeated group whose body is itself repeatable.
 */
const NESTED_QUANTIFIER = [
  /\([^)]*[+*][^)]*\)\s*[+*{]/, //   (a+)+   (a*)*   (\d+){2,}
  /\(\?:[^)]*[+*][^)]*\)\s*[+*{]/, // (?:a+)+
  /\[[^\]]+\]\s*[+*]\s*\[[^\]]+\]\s*[+*]/, // [a-z]+[a-z]+
]

export function lintPattern(pattern: string, kind: 'term' | 'regex'): LintResult {
  const trimmed = pattern.trim()
  if (!trimmed) return { ok: false, error: 'A pattern is required.' }

  if (kind === 'term') {
    // Terms are escaped to literals before they run, so they cannot backtrack.
    // The only failure mode worth naming is the \m/\M one, which is silent.
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    const isWord = (c: string) => /[\p{L}\p{N}_]/u.test(c)
    if (!isWord(first) || !isWord(last)) {
      return {
        ok: false,
        error:
          'A term must start and end with a letter, digit or underscore. Word-boundary matching means a term wrapped in punctuation can never match anything.',
      }
    }
    return { ok: true }
  }

  const compiled = compileForLint(trimmed)
  if (!compiled) {
    return {
      ok: false,
      error:
        'This is not a regular expression the browser can run. It will still be enforced after posting, but nothing will be highlighted while the member types.',
    }
  }

  for (const shape of NESTED_QUANTIFIER) {
    if (shape.test(trimmed)) {
      return {
        ok: false,
        error:
          'This pattern nests one repetition inside another, which can take exponential time on ordinary text and would freeze the composer.',
      }
    }
  }

  const started = performance.now()
  try {
    compiled.lastIndex = 0
    compiled.test(ADVERSARIAL)
  } catch {
    return { ok: false, error: 'This pattern failed to run.' }
  }
  const elapsed = performance.now() - started

  if (elapsed > BUDGET_MS) {
    return {
      ok: false,
      error: `This pattern took ${Math.round(elapsed)}ms on a 2KB sample; anything over ${BUDGET_MS}ms makes typing stutter.`,
    }
  }

  if (elapsed > BUDGET_MS / 5) {
    return {
      ok: true,
      warning: `This pattern is slow (${Math.round(elapsed)}ms on a 2KB sample). It will work, but keep an eye on long-form fields.`,
    }
  }

  return { ok: true }
}
