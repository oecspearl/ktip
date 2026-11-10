/**
 * The number check on AI-written share messages.
 *
 * A share message goes out under a member's name to people who will act on it:
 * a wrong deadline or a doubled grant amount is worse than a dull sentence. So
 * every run of digits in a draft must also appear in the record the draft was
 * written from. It is deliberately dumb — no parsing of dates or currencies —
 * because the failure it exists for is the model inventing a figure, and any
 * figure it invents shows up as digits the record does not have.
 *
 * Shared by api/share.ts (which flags drafts before returning them) and the
 * share sheet (which re-checks as the member edits). Keep it free of browser
 * and Lingui imports so the edge function can load it.
 */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/**
 * The numbers in a piece of text, as digit strings. Thousands separators (",",
 * ".", ordinary and narrow no-break spaces) are dropped first, so "50,000",
 * "50.000" and "50 000" all read as 50000 — French and Spanish drafts write
 * amounts differently from the English record. Leading zeros go too, so the
 * "04" of an ISO date matches the "4" of "4 December".
 */
export function numbersIn(text: string): string[] {
  const joined = String(text).replace(/(\d)[,.\s  ](?=\d{3}(?!\d))/g, '$1')
  return (joined.match(/\d+/g) || []).map((n) => n.replace(/^0+(?=\d)/, ''))
}

/**
 * Every number in `draft` that the record does not contain. An empty array
 * means the draft passed. `record` is anything JSON-serialisable: the same
 * object the model was given.
 *
 * Month names in the record also allow their month number, so a draft that
 * writes 15/01/2027 for "15 January 2027" is not flagged.
 */
export function unmatchedNumbers(draft: string, record: unknown): string[] {
  return unmatchedIn(draft, allowedNumbers(record))
}

/**
 * The numbers a draft about this record may contain. The API returns this
 * list with the takes, so the share sheet can re-check a take as the member
 * edits it without ever holding the record itself.
 */
export function allowedNumbers(record: unknown): string[] {
  const source = JSON.stringify(record)
  const allowed = new Set(numbersIn(source))
  const lower = source.toLowerCase()
  MONTHS.forEach((month, i) => {
    if (lower.includes(month)) allowed.add(String(i + 1))
  })
  return [...allowed]
}

/** Every number in `draft` missing from `allowed`, once each. */
export function unmatchedIn(draft: string, allowed: Iterable<string>): string[] {
  const set = new Set(allowed)
  return [...new Set(numbersIn(draft).filter((n) => !set.has(n)))]
}
