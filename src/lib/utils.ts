import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date string to a readable format
 */
export function formatDate(date: string | Date, formatString: string = 'PPP'): string {
  return format(new Date(date), formatString)
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

/**
 * Sanitize HTML to prevent XSS attacks
 * For production, consider using DOMPurify library
 */
export function sanitizeHTML(html: string): string {
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Truncate text to a specified length
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}

/**
 * Generate a random color for avatars
 */
export function generateAvatarColor(name: string): string {
  const colors = [
    'bg-ktip-ocean-400',
    'bg-ktip-tropical-400',
    'bg-ktip-sun-400',
    'bg-ktip-ocean-600',
    'bg-ktip-sun-500',
    'bg-ktip-tropical-600',
  ]
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * Parse hashtags from text
 */
export function parseHashtags(text: string): string[] {
  const hashtagRegex = /#(\w+)/g
  const matches = text.match(hashtagRegex)
  return matches ? matches.map((tag) => tag.slice(1)) : []
}

/**
 * Escape ILIKE metacharacters in a search string for safe use in Supabase/Postgres queries.
 * Escapes %, _, and \ which have special meaning in ILIKE patterns.
 */
export function escapeIlike(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/[,.()'"]/g, '')
}

/**
 * Normalise a tag before it is stored.
 *
 * PostgREST serialises array filters as a bare `ov.{a,b}` with no quoting, so a
 * stored tag containing a comma, brace, quote or backslash would silently
 * corrupt any `.overlaps()` filter built from it. Strip those, collapse
 * whitespace, and cap the length. Returns '' for tags that reduce to nothing.
 */
export function sanitizeTag(input: string): string {
  return input
    .replace(/[,{}"\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

/**
 * Tags for a project. Stored bare — the leading `#` is a display convention
 * applied on the card and detail page — so strip it on the way in, sanitize,
 * and drop the duplicates stripping can create.
 */
export function normalizeHashtags(input: string[]): string[] {
  const seen = new Set<string>()
  for (const raw of input) {
    const tag = sanitizeTag(raw.replace(/^#+/, ''))
    if (tag) seen.add(tag)
  }
  return [...seen]
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    return false
  }
}

/**
 * True when a Supabase error is an RLS refusal rather than a bad request.
 *
 * PostgREST reports a failed `WITH CHECK` as 42501 / "insufficient privilege",
 * which surfaces to the browser as a bare 403. The raw message names the policy
 * and means nothing to a member, so callers swap in something actionable.
 */
export function isPermissionDenied(error: unknown): boolean {
  const err = error as { code?: string; message?: string; status?: number } | null
  if (!err) return false
  if (err.code === '42501' || err.status === 403) return true
  const msg = err.message?.toLowerCase() ?? ''
  return msg.includes('row-level security') || msg.includes('violates row')
}
