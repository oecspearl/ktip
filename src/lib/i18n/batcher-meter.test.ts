import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { request, resetBatcher } from './batcher'
import { clearLocal, resetLocalCacheProbe } from './local-cache'

// The batcher loads the Supabase client lazily, for metered requests only.
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'member-token' } } }),
    },
  },
}))

interface Sent {
  headers: Record<string, string>
  body: { to: string; items: { t: string }[]; ctx?: { s: string; r: string } }
}

function mockFetch() {
  const sent: Sent[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Sent['body']
      sent.push({ headers: (init?.headers ?? {}) as Record<string, string>, body })
      const results: Record<string, { t: string; cached: boolean }> = {}
      body.items.forEach((item, i) => (results[String(i)] = { t: `[x] ${item.t}`, cached: false }))
      return { ok: true, json: async () => ({ to: body.to, results }) } as unknown as Response
    })
  )
  return sent
}

beforeEach(() => {
  vi.useFakeTimers()
  resetBatcher()
  resetLocalCacheProbe()
  clearLocal()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function settle() {
  for (let i = 0; i < 8; i++) {
    await vi.advanceTimersByTimeAsync(60)
    await Promise.resolve()
  }
}

const ROOM = '11111111-2222-4333-8444-555555555555'
const OTHER_ROOM = '66666666-7777-4888-8999-000000000000'

describe('metered translation requests', () => {
  it('sends the venue context and the member token when metered', async () => {
    const sent = mockFetch()
    const done = request('Bonjour tout le monde', 'text', 'en', {
      from: 'fr',
      meter: { surface: 'chat', roomId: ROOM },
    })
    await settle()
    await done

    expect(sent).toHaveLength(1)
    expect(sent[0].body.ctx).toEqual({ s: 'chat', r: ROOM })
    expect(sent[0].headers.Authorization).toBe('Bearer member-token')
  })

  it('leaves an unmetered request exactly as it was: no context, no token', async () => {
    const sent = mockFetch()
    const done = request('Solar irrigation for small farms', 'text', 'fr')
    await settle()
    await done

    expect(sent).toHaveLength(1)
    expect(sent[0].body.ctx).toBeUndefined()
    expect(sent[0].headers.Authorization).toBeUndefined()
  })

  it('never lets one batch straddle two rooms or a metered and an unmetered caller', async () => {
    const sent = mockFetch()
    const a = request('First message here', 'text', 'fr', { meter: { surface: 'chat', roomId: ROOM } })
    const b = request('Second message here', 'text', 'fr', {
      meter: { surface: 'chat', roomId: OTHER_ROOM },
    })
    const c = request('A project summary', 'text', 'fr')
    await settle()
    await Promise.all([a, b, c])

    // Three requests, one per context. Order is not the point: a metered send
    // waits for the token, so the unmetered one can overtake it.
    expect(sent).toHaveLength(3)
    expect(sent.map((s) => s.body.ctx?.r ?? 'none').sort()).toEqual(
      [ROOM, OTHER_ROOM, 'none'].sort()
    )
    for (const s of sent) expect(s.body.items).toHaveLength(1)
  })
})
