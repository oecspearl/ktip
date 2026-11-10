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
 * household rotate through 2^64 buckets. The address is expanded first: the
 * old "first four colon-separated parts" read `2001:db8::1:2:3` as
 * `2001:db8::1`, which kept host bits and gave each host its own bucket.
 */
export function clientIp(request: Request): string {
  const raw =
    request.headers.get('x-real-ip') ||
    (request.headers.get('x-vercel-forwarded-for') || '').split(',')[0].trim() ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    ''
  if (!raw) return 'unknown'
  if (raw.includes(':')) return ipv6Prefix64(raw)
  return raw
}

/** The first four groups of an IPv6 address, `::` expanded, zeros unpadded. */
function ipv6Prefix64(address: string): string {
  const bare = address.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase()
  // An IPv4 client seen through a dual-stack listener: bucket the IPv4.
  const mapped = bare.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mapped) return mapped[1]

  const [head, tail] = bare.split('::', 2)
  const left = head ? head.split(':') : []
  let groups = left
  if (tail !== undefined) {
    const right = tail ? tail.split(':') : []
    const fill = Math.max(0, 8 - left.length - right.length)
    groups = [...left, ...Array<string>(fill).fill('0'), ...right]
  }
  return groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, '') || '0')
    .join(':')
}
