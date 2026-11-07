import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderRateLimited, getProvider, usableCaption } from '../../../api/_lib/translate-provider'

/**
 * The OpenRouter adapter, and specifically the ways a model can answer badly.
 *
 * A dedicated MT endpoint answers with an array of the length you asked for. A
 * model answers with whatever it feels like — and the failure that matters is
 * not a crash, it is a SHORT array paired positionally, which renders somebody
 * else's sentence under a member's name with no error anywhere. Most of what is
 * asserted here is that the adapter refuses to guess.
 */

const ORIGINAL_ENV = { ...process.env }

/** Build the body OpenRouter returns on the happy path. */
function completion(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    text: async () => '',
  } as unknown as Response
}

function mockFetch(response: Response | Promise<Response>) {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  process.env.TRANSLATION_PROVIDER = 'openrouter'
  process.env.OPENROUTER_API_KEY = 'sk-or-test'
  process.env.OPENROUTER_TRANSLATE_MODEL = 'test/model'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Non-null asserted: every test in this file configures a key in beforeEach. */
const provider = () => getProvider()!

describe('getProvider', () => {
  it('selects OpenRouter and records the model in the id, so a bad batch is traceable', () => {
    expect(provider().id).toBe('openrouter:test/model')
  })

  it('returns null without a key rather than throwing — no key is a supported state', () => {
    delete process.env.OPENROUTER_API_KEY
    expect(getProvider()).toBeNull()
  })

  it('falls back to Azure when TRANSLATION_PROVIDER says so', () => {
    process.env.TRANSLATION_PROVIDER = 'azure'
    process.env.AZURE_TRANSLATOR_KEY = 'azure-test'
    expect(getProvider()?.id).toBe('azure')
  })

  it('chunks well below Azure — LLM positional fidelity degrades with batch length', () => {
    expect(provider().maxItemsPerCall).toBe(50)
    expect(provider().maxCharsPerCall).toBe(20_000)
  })
})

describe('openrouter translate', () => {
  it('pairs translations positionally and reports the detected source language', async () => {
    mockFetch(completion({ t: ['Bonjour', 'Au revoir'], f: ['en', 'en'] }))

    const out = await provider().translate(
      ['Hello', 'Goodbye'],
      'fr',
      'text',
      new AbortController().signal
    )

    expect(out).toEqual([
      { text: 'Bonjour', detected: 'en' },
      { text: 'Au revoir', detected: 'en' },
    ])
  })

  it('asks for strict JSON, sends the attribution headers, and pins temperature to 0', async () => {
    const fetchMock = mockFetch(completion({ t: ['Hola'], f: ['en'] }))
    process.env.OPENROUTER_SITE_URL = 'https://example.test'
    process.env.OPENROUTER_APP_NAME = 'KTIP-test'

    await provider().translate(['Hello'], 'es', 'text', new AbortController().signal)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')

    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-or-test')
    expect(headers['HTTP-Referer']).toBe('https://example.test')
    expect(headers['X-Title']).toBe('KTIP-test')

    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('test/model')
    // Translation is not a creative task, and the same string must not produce
    // different French on a later cache miss.
    expect(body.temperature).toBe(0)
    expect(body.response_format.json_schema.strict).toBe(true)
    // The prompt has to name the language, not the code — models translate
    // measurably better when told "Spanish".
    expect(body.messages[0].content).toContain('Spanish')
    expect(body.messages[0].content).toContain('KTIP, OECS')
  })

  it('tells the model to preserve markup when the format is html', async () => {
    const fetchMock = mockFetch(completion({ t: ['<p>Bonjour</p>'], f: ['en'] }))

    await provider().translate(['<p>Hello</p>'], 'fr', 'html', new AbortController().signal)

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.messages[0].content).toContain('HTML')
  })

  // THE important one. A short answer says nothing about WHICH element went
  // missing, so pairing any of them by index is a guess — and a wrong guess here
  // is a member's message replaced by a stranger's.
  it('returns every source unchanged when the model answers with the wrong count', async () => {
    mockFetch(completion({ t: ['Bonjour'], f: ['en'] }))

    const out = await provider().translate(
      ['Hello', 'Goodbye', 'Thanks'],
      'fr',
      'text',
      new AbortController().signal
    )

    expect(out).toEqual([{ text: 'Hello' }, { text: 'Goodbye' }, { text: 'Thanks' }])
  })

  it('falls back per element when one is not a usable string', async () => {
    mockFetch(completion({ t: ['Bonjour', '', 42], f: ['en', 'en', 'en'] }))

    const out = await provider().translate(
      ['Hello', 'Goodbye', 'Thanks'],
      'fr',
      'text',
      new AbortController().signal
    )

    // Only the first survives; the empty string and the number are both
    // rejected in favour of the source the reader already has on screen.
    expect(out[0]).toEqual({ text: 'Bonjour', detected: 'en' })
    expect(out[1]).toEqual({ text: 'Goodbye' })
    expect(out[2]).toEqual({ text: 'Thanks' })
  })

  it('tolerates a missing detected-language array', async () => {
    mockFetch(completion({ t: ['Bonjour'] }))

    const out = await provider().translate(['Hello'], 'fr', 'text', new AbortController().signal)
    expect(out).toEqual([{ text: 'Bonjour' }])
  })

  it('throws ProviderRateLimited with the retry-after header on a 429', async () => {
    mockFetch({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '17' }),
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response)

    await expect(
      provider().translate(['Hello'], 'fr', 'text', new AbortController().signal)
    ).rejects.toMatchObject({ name: 'ProviderRateLimited', retryAfter: 17 })
  })

  it('defaults the backoff to 60s when the header is missing or nonsense', async () => {
    mockFetch({
      ok: false,
      status: 503,
      headers: new Headers({ 'retry-after': 'soon' }),
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response)

    await expect(
      provider().translate(['Hello'], 'fr', 'text', new AbortController().signal)
    ).rejects.toBeInstanceOf(ProviderRateLimited)
  })

  // OpenRouter reports some upstream failures as a 200 with an error body.
  // Untreated that reads as "no choices" and silently echoes English.
  it('treats an error body on a 200 as a failure, not as an empty answer', async () => {
    mockFetch({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ error: { message: 'no credit', code: 402 } }),
      text: async () => '',
    } as unknown as Response)

    await expect(
      provider().translate(['Hello'], 'fr', 'text', new AbortController().signal)
    ).rejects.toThrow(/no credit/)
  })

  it('maps a 429 delivered inside a 200 body onto the same backoff path', async () => {
    mockFetch({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ error: { message: 'slow down', code: 429 } }),
      text: async () => '',
    } as unknown as Response)

    await expect(
      provider().translate(['Hello'], 'fr', 'text', new AbortController().signal)
    ).rejects.toBeInstanceOf(ProviderRateLimited)
  })

  it('throws when the model returns prose instead of JSON', async () => {
    mockFetch({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ choices: [{ message: { content: 'Sure! Here you go:' } }] }),
      text: async () => '',
    } as unknown as Response)

    await expect(
      provider().translate(['Hello'], 'fr', 'text', new AbortController().signal)
    ).rejects.toThrow(/not JSON/)
  })
})

describe('groq translate', () => {
  const rateLimited = () =>
    ({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '30' }),
      json: async () => ({}),
      text: async () => '',
    }) as unknown as Response

  beforeEach(() => {
    process.env.TRANSLATION_PROVIDER = 'groq'
    process.env.GROQ_API_KEY = 'gsk-test'
    delete process.env.GROQ_TRANSLATE_MODEL
    delete process.env.GROQ_TRANSLATE_FALLBACK_MODEL
  })

  it('selects Groq with gpt-oss-20b by default, and is null without a key', () => {
    expect(provider().id).toBe('groq:openai/gpt-oss-20b')
    delete process.env.GROQ_API_KEY
    expect(getProvider()).toBeNull()
  })

  it('asks gpt-oss for a strict schema with low reasoning effort, on Groq', async () => {
    const fetchMock = mockFetch(completion({ t: ['Bonjour'], f: ['en'] }))
    const out = await provider().translate(['Hello'], 'fr', 'text', new AbortController().signal)
    expect(out).toEqual([{ text: 'Bonjour', detected: 'en' }])

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('openai/gpt-oss-20b')
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.strict).toBe(true)
    expect(body.reasoning_effort).toBe('low')
    expect((init.headers as Record<string, string>)['HTTP-Referer']).toBeUndefined()
  })

  it('falls back to gpt-oss-120b, still strict, when the primary is rate limited', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(completion({ t: ['Hola'], f: ['en'] }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const out = await provider().translate(['Hello'], 'es', 'text', new AbortController().signal)
    expect(out).toEqual([{ text: 'Hola', detected: 'en' }])

    const second = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body))
    expect(second.model).toBe('openai/gpt-oss-120b')
    expect(second.response_format.type).toBe('json_schema')
    expect(second.reasoning_effort).toBe('low')
  })

  it('asks a model without strict schemas for a JSON object, spelled out in the prompt', async () => {
    process.env.GROQ_TRANSLATE_FALLBACK_MODEL = 'some/plain-model'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(completion({ t: ['Hola'], f: ['en'] }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await provider().translate(['Hello'], 'es', 'text', new AbortController().signal)
    const second = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body))
    expect(second.model).toBe('some/plain-model')
    expect(second.response_format).toEqual({ type: 'json_object' })
    expect(second.reasoning_effort).toBeUndefined()
    expect(second.messages[0].content).toMatch(/JSON object \{"translations"/)
  })

  it('surfaces the rate limit when the fallback is switched off', async () => {
    process.env.GROQ_TRANSLATE_FALLBACK_MODEL = 'none'
    mockFetch(rateLimited())
    await expect(
      provider().translate(['Hello'], 'fr', 'text', new AbortController().signal)
    ).rejects.toBeInstanceOf(ProviderRateLimited)
  })

  it('still refuses a ragged answer from the fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(rateLimited())
        .mockResolvedValueOnce(completion({ t: ['Hola'], f: [] }))
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await provider().translate(['Hello', 'Bye'], 'es', 'text', new AbortController().signal)
    expect(out).toEqual([{ text: 'Hello' }, { text: 'Bye' }])
  })
})

describe('answers a model can garble', () => {
  it('reads the named fields the prompt now asks for', async () => {
    mockFetch(completion({ translations: ['Bonjour'], source_languages: ['en'] }))
    const out = await provider().translate(['Hello'], 'fr', 'text', new AbortController().signal)
    expect(out).toEqual([{ text: 'Bonjour', detected: 'en' }])
  })

  it('refuses a swapped answer: a language code is not a translation', async () => {
    // What gpt-oss-20b on Groq returned once with the old one-letter fields.
    mockFetch(completion({ t: ['en', 'en'], f: ['Bonjour,', 'Quoi de '] }))
    const out = await provider().translate(['Good morning', 'What is up'], 'fr', 'text', new AbortController().signal)
    expect(out).toEqual([{ text: 'Good morning' }, { text: 'What is up' }])
  })

  it('keeps only real language codes as the detected language', async () => {
    mockFetch(completion({ translations: ['Hola', 'Adiós'], source_languages: ['Good mor', 'EN'] }))
    const out = await provider().translate(['Hello', 'Bye'], 'es', 'text', new AbortController().signal)
    expect(out).toEqual([{ text: 'Hola' }, { text: 'Adiós', detected: 'en' }])
  })
})

describe('caption translation, every language in one call', () => {
  const signal = () => new AbortController().signal
  const rateLimited = () =>
    ({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '30' }),
      json: async () => ({}),
      text: async () => '',
    }) as unknown as Response

  beforeEach(() => {
    process.env.TRANSLATION_PROVIDER = 'groq'
    process.env.GROQ_API_KEY = 'gsk-test'
    delete process.env.GROQ_TRANSLATE_MODEL
    delete process.env.GROQ_TRANSLATE_FALLBACK_MODEL
  })

  it('asks once for both languages, keyed by code, with the previous piece as context', async () => {
    const fetchMock = mockFetch(completion({ fr: 'tester le prototype', es: 'probar el prototipo' }))
    const out = await provider().translateCaption!(
      { text: 'test the prototype', from: 'en', to: ['fr', 'es'], context: 'next week we want to' },
      signal()
    )
    expect(out).toEqual({ fr: 'tester le prototype', es: 'probar el prototipo' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.response_format.json_schema.schema.required).toEqual(['fr', 'es'])
    expect(JSON.parse(body.messages[1].content)).toEqual({
      previous: 'next week we want to',
      fragment: 'test the prototype',
    })
    expect(body.messages[0].content).toContain('never finish the sentence')
  })

  it('sends no "previous" when there is no context', async () => {
    const fetchMock = mockFetch(completion({ fr: 'bonjour', es: 'hola' }))
    await provider().translateCaption!({ text: 'hello', from: 'en', to: ['fr', 'es'] }, signal())
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(JSON.parse(body.messages[1].content)).toEqual({ fragment: 'hello' })
  })

  it('leaves out a language whose answer is unusable', async () => {
    mockFetch(completion({ fr: 'en', es: '' }))
    const out = await provider().translateCaption!({ text: 'hello there', from: 'en', to: ['fr', 'es'] }, signal())
    expect(out).toEqual({})
  })

  it('falls back to the second model when the first is rate limited', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(completion({ en: 'good morning', es: 'buenos días' }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const out = await provider().translateCaption!({ text: 'bonjour', from: 'fr', to: ['en', 'es'] }, signal())
    expect(out).toEqual({ en: 'good morning', es: 'buenos días' })
    const second = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body))
    expect(second.model).toBe('openai/gpt-oss-120b')
  })

  it('asks Azure for both languages in one call, ignoring the context', async () => {
    process.env.TRANSLATION_PROVIDER = 'azure'
    process.env.AZURE_TRANSLATOR_KEY = 'azure-test'
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [{ translations: [{ text: 'bonjour', to: 'fr' }, { text: 'hola', to: 'es' }] }],
      text: async () => '',
    } as unknown as Response)
    const out = await provider().translateCaption!(
      { text: 'hello', from: 'en', to: ['fr', 'es'], context: 'ignored' },
      signal()
    )
    expect(out).toEqual({ fr: 'bonjour', es: 'hola' })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toContain('&from=en&to=fr&to=es')
  })
})

describe('usableCaption', () => {
  it('takes a real translation, trimmed', () => {
    expect(usableCaption('hello', ' bonjour ')).toBe('bonjour')
  })

  it('refuses empty, non-string, a bare language code, and a runaway answer', () => {
    expect(usableCaption('hello', '')).toBeNull()
    expect(usableCaption('hello', 42)).toBeNull()
    expect(usableCaption('hello there', 'fr')).toBeNull()
    expect(usableCaption('yes', 'x'.repeat(100))).toBeNull()
  })
})
