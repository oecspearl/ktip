import { describe, expect, it } from 'vitest'
import { scrubEvent, scrubTransaction } from './monitoring'

const EMAIL = 'zoe@example.com'
const UUID = '1f8b0c4e-3a7d-4c2b-9f1e-6d5a4b3c2d1e'

function errorEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: undefined,
    event_id: 'abc',
    exception: {
      values: [{ type: 'TypeError', value: `Cannot read grant ${UUID}` }],
    },
    tags: { area: 'data-api', error_code: 'DATA_API_UNAVAILABLE' },
    ...overrides,
  } as Parameters<typeof scrubEvent>[0]
}

describe('scrubEvent', () => {
  it('keeps the thrown message and its record UUID', () => {
    const event = scrubEvent(errorEvent())

    expect(event.exception?.values?.[0]?.value).toBe(`Cannot read grant ${UUID}`)
    expect(event.exception?.values?.[0]?.type).toBe('TypeError')
  })

  it('redacts an email out of the thrown message but keeps the rest', () => {
    const event = scrubEvent(errorEvent({
      exception: { values: [{ type: 'Error', value: `no profile for ${EMAIL} on ${UUID}` }] },
    }))

    expect(event.exception?.values?.[0]?.value).toBe(`no profile for [email] on ${UUID}`)
  })

  it('falls back to the registered constant when an error has no message', () => {
    const event = scrubEvent(errorEvent({
      exception: { values: [{ type: 'Error', value: '' }] },
    }))

    expect(event.exception?.values?.[0]?.value).toBe(
      'DATA_API_UNAVAILABLE: Supabase Data API failed to load public content',
    )
  })

  it('keeps the user UUID and drops the rest of the user record', () => {
    const event = scrubEvent(errorEvent({
      user: { id: UUID, email: EMAIL, username: 'zoe', ip_address: '1.2.3.4' },
    }))

    expect(event.user).toEqual({ id: UUID })
  })

  it('keeps extra and contexts, redacted', () => {
    const event = scrubEvent(errorEvent({
      extra: { project_id: UUID, invited: EMAIL, retry_count: 2 },
      contexts: {
        trace: { trace_id: 'abc', span_id: 'def' },
        response: { status_code: 503, owner: EMAIL },
      },
    }))

    expect(event.extra).toEqual({ project_id: UUID, invited: '[email]', retry_count: 2 })
    expect(event.contexts?.trace).toEqual({ trace_id: 'abc', span_id: 'def' })
    expect(event.contexts?.response).toEqual({ status_code: 503, owner: '[email]' })
  })

  it('keeps breadcrumb messages and data, redacted', () => {
    const event = scrubEvent(errorEvent({
      breadcrumbs: [{
        category: 'fetch',
        level: 'info',
        timestamp: 1,
        type: 'http',
        message: `GET /api/projects/${UUID}`,
        data: { status_code: 500, invited: EMAIL, authorization: 'Bearer abc' },
      }],
    }))

    expect(event.breadcrumbs?.[0]).toEqual({
      category: 'fetch',
      level: 'info',
      timestamp: 1,
      type: 'http',
      message: `GET /api/projects/${UUID}`,
      data: { status_code: 500, invited: '[email]', authorization: '[redacted]' },
    })
  })

  it('keeps the request URL and method but never the body, cookies, or headers', () => {
    const event = scrubEvent(errorEvent({
      request: {
        url: `https://ktip.org/projects/${UUID}?token=secret123&tab=grants`,
        method: 'POST',
        data: { proposal: 'confidential body' },
        cookies: { session: 'abc' },
        headers: { Authorization: 'Bearer abc' },
      },
    }))

    expect(event.request).toEqual({
      url: `https://ktip.org/projects/${UUID}?token=[secret]&tab=grants`,
      method: 'POST',
      query_string: undefined,
    })
  })

  it('leaves no email anywhere in the event', () => {
    const event = scrubEvent(errorEvent({
      user: { id: UUID, email: EMAIL },
      message: EMAIL,
      logentry: { message: `hi ${EMAIL}` },
      extra: { a: [{ b: EMAIL }] },
      contexts: { state: { value: EMAIL } },
      tags: { area: 'data-api', owner: EMAIL },
      breadcrumbs: [{ message: EMAIL, data: { to: EMAIL } }],
      request: { url: `https://ktip.org/?email=${EMAIL}` },
    }))

    expect(JSON.stringify(event)).not.toContain(EMAIL)
  })
})

describe('scrubTransaction', () => {
  it('normalises record IDs so routes aggregate', () => {
    const event = scrubTransaction({
      type: 'transaction',
      transaction: `/projects/${UUID}/tasks/42`,
    } as Parameters<typeof scrubTransaction>[0])

    expect(event.transaction).toBe('/projects/:id/tasks/:id')
  })

  // Migration 087 put slugs in these positions, and a slug has no shape a regex
  // can spot — without the position rule every grant is its own transaction.
  it('normalises a slug in a record position', () => {
    const name = (transaction: string) =>
      scrubTransaction({ type: 'transaction', transaction } as Parameters<
        typeof scrubTransaction
      >[0]).transaction

    expect(name('/grants/oecs-blue-economy-innovation-fund')).toBe('/grants/:id')
    expect(name('/events/oecs-climathon')).toBe('/events/:id')
    expect(name('/user/delon-pierre/cv')).toBe('/user/:id/cv')
    expect(name('/forums/showcase/my-first-build')).toBe('/forums/showcase/:id')
  })

  it('leaves literal child routes alone, including slugs that start like one', () => {
    const name = (transaction: string) =>
      scrubTransaction({ type: 'transaction', transaction } as Parameters<
        typeof scrubTransaction
      >[0]).transaction

    expect(name('/grants/my-applications')).toBe('/grants/my-applications')
    expect(name('/events/new')).toBe('/events/new')
    expect(name('/forums/showcase/new')).toBe('/forums/showcase/new')
    expect(name('/events/virtual-hackathon/oecs-climathon')).toBe(
      '/events/virtual-hackathon/oecs-climathon'
    )
    expect(name('/events/virtual-conference/oecs-summit')).toBe(
      '/events/virtual-conference/oecs-summit'
    )
    // "newton-fund" begins with "new" and is still a record.
    expect(name('/grants/newton-fund')).toBe('/grants/:id')
  })

  it('keeps span descriptions and data, redacted', () => {
    const event = scrubTransaction({
      type: 'transaction',
      transaction: '/search',
      spans: [{
        span_id: 'aaa',
        trace_id: 'bbb',
        start_timestamp: 1,
        description: `select grants where owner = ${UUID} and email = ${EMAIL}`,
        data: { 'db.system': 'postgresql', invited: EMAIL },
      }],
    } as Parameters<typeof scrubTransaction>[0])

    expect(JSON.stringify(event)).not.toContain(EMAIL)
    expect(event.spans?.[0]?.description).toBe(
      `select grants where owner = ${UUID} and email = [email]`,
    )
    expect(event.spans?.[0]?.data).toEqual({ 'db.system': 'postgresql', invited: '[email]' })
  })
})
