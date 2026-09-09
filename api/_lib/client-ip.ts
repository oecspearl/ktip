/**
 * The caller's address, as the platform in front of us saw it.
 *
 * `x-forwarded-for` is appended to by every proxy in the chain and the FIRST
 * entry is whatever the client chose to send, so a rate limit keyed on it costs
 * an attacker one header per request to reset. Vercel writes the address it
 * actually accepted the connection from into `x-real-ip` and
 * `x-vercel-forwarded-for`, which the client cannot influence; those are read
 * first and the leftmost `x-forwarded-for` entry is the fallback for a local
 * `vite dev` server, where nothing sets the trusted pair.
 *
 * IPv6 is truncated to its /64. A residential IPv6 allocation hands the
 * subscriber the whole prefix, so keying on the full address would let one
 * household rotate through 2^64 buckets.
 */
export function clientIp(request: Request): string {
  const raw =
    request.headers.get('x-real-ip') ||
    (request.headers.get('x-vercel-forwarded-for') || '').split(',')[0].trim() ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    ''
  if (!raw) return 'unknown'
  if (raw.includes(':')) return raw.split(':').slice(0, 4).join(':')
  return raw
}
