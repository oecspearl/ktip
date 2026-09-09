import { describe, expect, it, vi } from 'vitest'
import { canCheckEmail, checkEmailAvailable } from './email-available'

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('canCheckEmail', () => {
  it('only lets a plausible address through', () => {
    expect(canCheckEmail('  someone@oecs.int ')).toBe(true)
    expect(canCheckEmail('someone')).toBe(false)
    expect(canCheckEmail('someone@oecs')).toBe(false)
    expect(canCheckEmail(`${'a'.repeat(250)}@oecs.int`)).toBe(false)
  })
})

describe('checkEmailAvailable', () => {
  it('does not ask about an address the route would reject', async () => {
    const fetchImpl = respond(200, { in_use: true })
    expect(await checkEmailAvailable('nope', undefined, fetchImpl)).toBe('unknown')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('normalises the address before sending it', async () => {
    const fetchImpl = respond(200, { in_use: false })
    await checkEmailAvailable('  Someone@OECS.int ', undefined, fetchImpl)
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ email: 'someone@oecs.int' })
  })

  it('maps the two real answers', async () => {
    expect(await checkEmailAvailable('a@b.co', undefined, respond(200, { in_use: true }))).toBe('taken')
    expect(await checkEmailAvailable('a@b.co', undefined, respond(200, { in_use: false }))).toBe('free')
  })

  it('is unknown, never taken, for every failure', async () => {
    expect(await checkEmailAvailable('a@b.co', undefined, respond(429, { error: 'rate_limited' }))).toBe('unknown')
    expect(await checkEmailAvailable('a@b.co', undefined, respond(500, { error: 'server_error' }))).toBe('unknown')
    expect(await checkEmailAvailable('a@b.co', undefined, respond(200, {}))).toBe('unknown')
    const thrower = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await checkEmailAvailable('a@b.co', undefined, thrower)).toBe('unknown')
  })
})
