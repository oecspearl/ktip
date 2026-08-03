import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { I18nTestProvider } from '../test/i18n'
import {
  useAIAssistant,
  loadThread,
  saveThread,
  clearStoredThread,
  type ChatMessage,
} from './useAIAssistant'

const USER_ID = 'user-1'
const STORAGE_KEY = `ktip_assistant_thread_${USER_ID}`

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return (
    <I18nTestProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </I18nTestProvider>
  )
}

function chatResponse(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) }
}

function navResponse(body: { ids?: string[]; answer?: string; steps?: string[] }) {
  return { ok: true, json: async () => body }
}

/** Route by URL so the two endpoints can succeed or fail independently. */
function stubFetch(handlers: { chat?: () => any; nav?: () => any }) {
  const fetchMock = vi.fn(async (url: string) => {
    const handler = url.includes('ai-search') ? handlers.nav : handlers.chat
    if (!handler) throw new Error('network down')
    return handler()
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('thread persistence', () => {
  const messages: ChatMessage[] = [
    { id: 'a', role: 'user', content: 'hi', timestamp: new Date('2026-01-01T10:00:00Z') },
    { id: 'b', role: 'assistant', content: 'hello', timestamp: new Date('2026-01-01T10:00:05Z') },
  ]

  it('round-trips messages, reviving timestamps as Dates', () => {
    saveThread(USER_ID, messages)
    const loaded = loadThread(USER_ID)

    expect(loaded).toHaveLength(2)
    expect(loaded![0].timestamp).toBeInstanceOf(Date)
    expect(loaded![0].timestamp.toISOString()).toBe('2026-01-01T10:00:00.000Z')
    expect(loaded![1].content).toBe('hello')
  })

  it('keeps steps and destinations attached to a turn', () => {
    saveThread(USER_ID, [
      {
        ...messages[1],
        steps: ['Open Grants.'],
        destinations: [{ id: 'grants.browse', title: 'Browse Grants', href: '/grants' }],
      },
    ])

    const loaded = loadThread(USER_ID)!
    expect(loaded[0].steps).toEqual(['Open Grants.'])
    expect(loaded[0].destinations![0].href).toBe('/grants')
  })

  it('caps what it persists at 50 messages, keeping the newest', () => {
    const many: ChatMessage[] = Array.from({ length: 60 }, (_, i) => ({
      id: `m${i}`,
      role: 'user',
      content: `msg ${i}`,
      timestamp: new Date('2026-01-01T10:00:00Z'),
    }))
    saveThread(USER_ID, many)

    const loaded = loadThread(USER_ID)!
    expect(loaded).toHaveLength(50)
    expect(loaded[0].id).toBe('m10')
    expect(loaded[49].id).toBe('m59')
  })

  it('returns null rather than throwing on corrupt storage', () => {
    localStorage.setItem(STORAGE_KEY, 'not json')
    expect(loadThread(USER_ID)).toBeNull()
  })

  it('is a no-op without a user id', () => {
    saveThread(undefined, messages)
    expect(loadThread(undefined)).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('clears the stored thread', () => {
    saveThread(USER_ID, messages)
    clearStoredThread(USER_ID)
    expect(loadThread(USER_ID)).toBeNull()
  })
})

describe('useAIAssistant turn merging', () => {
  const render = () => renderHook(() => useAIAssistant({ userId: USER_ID }), { wrapper })

  it('starts with a welcome message and writes nothing to storage', () => {
    stubFetch({})
    const { result } = render()

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].id).toBe('welcome')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('combines the chat reply with navigator steps and destinations', async () => {
    stubFetch({
      chat: () => chatResponse('You apply through a 5-step wizard.'),
      nav: () => navResponse({ ids: ['grants.browse'], answer: 'Head to Grants.', steps: ['Open Grants.'] }),
    })
    const { result } = render()

    await act(async () => {
      await result.current.sendMessage('how do I apply for a grant?')
    })

    const last = result.current.messages.at(-1)!
    expect(last.content).toBe('You apply through a 5-step wizard.')
    expect(last.steps).toEqual(['Open Grants.'])
    expect(last.destinations?.[0].id).toBe('grants.browse')
  })

  it('calls both endpoints in parallel on one turn', async () => {
    const fetchMock = stubFetch({
      chat: () => chatResponse('ok'),
      nav: () => navResponse({ ids: [] }),
    })
    const { result } = render()

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    const urls = fetchMock.mock.calls.map((c) => c[0])
    expect(urls).toContain('/api/ai-chat')
    expect(urls).toContain('/api/ai-search')
  })

  it('keeps the reply and shows no error when the navigator is down', async () => {
    stubFetch({ chat: () => chatResponse('KTIP connects Caribbean innovators.') })
    const { result } = render()

    await act(async () => {
      await result.current.sendMessage('what is KTIP?')
    })

    const last = result.current.messages.at(-1)!
    expect(last.content).toBe('KTIP connects Caribbean innovators.')
    expect(last.destinations).toBeUndefined()
    expect(result.current.error).toBeNull()
  })

  it("falls back to the navigator's own answer when chat is down", async () => {
    stubFetch({
      nav: () => navResponse({ ids: ['grants.browse'], answer: 'Head to Grants.', steps: ['Open Grants.'] }),
    })
    const { result } = render()

    await act(async () => {
      await result.current.sendMessage('grants?')
    })

    const last = result.current.messages.at(-1)!
    expect(last.content).toBe('Head to Grants.')
    expect(last.destinations?.[0].id).toBe('grants.browse')
  })

  it('shows the canned error bubble when both endpoints fail', async () => {
    stubFetch({})
    const { result } = render()

    await act(async () => {
      await result.current.sendMessage('anything')
    })

    expect(result.current.messages.at(-1)!.content).toMatch(/ran into an issue/i)
    expect(result.current.error).toBeTruthy()
  })

  it('drops navigator ids the viewer cannot reach', async () => {
    stubFetch({
      chat: () => chatResponse('Only admins can do that.'),
      nav: () => navResponse({ ids: ['admin.users'], answer: '', steps: [] }),
    })
    const { result } = render()

    await act(async () => {
      await result.current.sendMessage('manage users')
    })

    expect(result.current.messages.at(-1)!.destinations).toBeUndefined()
  })

  it('persists the thread and restores it on the next mount', async () => {
    stubFetch({ chat: () => chatResponse('stored reply'), nav: () => navResponse({ ids: [] }) })
    const { result, unmount } = render()

    await act(async () => {
      await result.current.sendMessage('remember this')
    })
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy())
    unmount()

    const { result: revived } = render()
    expect(revived.current.messages.map((m) => m.content)).toContain('stored reply')
  })

  it('clearHistory resets to a welcome message and removes the key', async () => {
    stubFetch({ chat: () => chatResponse('reply'), nav: () => navResponse({ ids: [] }) })
    const { result } = render()

    await act(async () => {
      await result.current.sendMessage('hi')
    })
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy())

    act(() => result.current.clearHistory())

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].role).toBe('assistant')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
