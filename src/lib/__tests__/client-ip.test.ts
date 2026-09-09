import { describe, expect, it } from 'vitest'
import { clientIp } from '../../../api/_lib/client-ip'

/**
 * The rate-limit bucket IS the address this returns. If a client can choose
 * it, the throttle costs them one header per request.
 */
const req = (headers: Record<string, string>) =>
  new Request('https://ktip.test/api/x', { method: 'POST', headers })

describe('clientIp', () => {
  it('prefers the address the platform accepted the connection from', () => {
    expect(
      clientIp(
        req({
          'x-forwarded-for': '1.1.1.1, 203.0.113.9',
          'x-vercel-forwarded-for': '203.0.113.9',
          'x-real-ip': '203.0.113.9',
        })
      )
    ).toBe('203.0.113.9')
  })

  it('ignores a client-supplied x-forwarded-for when a trusted header exists', () => {
    expect(
      clientIp(req({ 'x-forwarded-for': '8.8.8.8', 'x-real-ip': '198.51.100.4' }))
    ).toBe('198.51.100.4')
  })

  it('falls back to the leftmost x-forwarded-for entry with no trusted header', () => {
    // vite dev: nothing sets the trusted pair. Better a spoofable key than none.
    expect(clientIp(req({ 'x-forwarded-for': '10.0.0.5, 10.0.0.1' }))).toBe('10.0.0.5')
  })

  it('collapses IPv6 to its /64', () => {
    expect(clientIp(req({ 'x-real-ip': '2001:db8:85a3:8d3:1319:8a2e:370:7348' }))).toBe(
      '2001:db8:85a3:8d3'
    )
  })

  it('is "unknown" with no address at all', () => {
    expect(clientIp(req({}))).toBe('unknown')
  })
})
