import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { resolveDestinations, type AssistantDestination } from '../lib/assistant'
import type { UserRole } from '../types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  /** Navigation steps from the site-map navigator, when it matched something. */
  steps?: string[]
  /** Clickable destinations resolved from the navigator's site-map ids. */
  destinations?: AssistantDestination[]
}

const MAX_HISTORY = 20
/** Cap on what is persisted, so a long-lived thread can't grow unbounded. */
const MAX_PERSISTED = 50
const STORAGE_PREFIX = 'ktip_assistant_thread_'

// Partial: the prompt only needs a friendly name for roles it recognises, and
// falls back to the raw slug for the rest.
const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  student: 'Student/Youth Innovator',
  mentor: 'Mentor',
  investor: 'Investor/Funding Agency',
  entrepreneur: 'Entrepreneur',
  private_sector: 'Private Sector/SME Partner',
  faculty: 'Faculty/Researcher',
  oecs: 'OECS Administrator',
  super_admin: 'OECS Administrator',
  safety_admin: 'Safety Administrator',
  sme: 'Verified SME',
  educational_partner: 'Educational Partner',
  chamber_admin: 'Chamber of Commerce Administrator',
  researcher: 'Researcher',
}

function buildSystemPrompt(userRole?: UserRole | null, userName?: string | null): string {
  const nameCtx = userName ? `The user's name is ${userName}. ` : ''
  const roleCtx = userRole
    ? `The user is logged in as a "${ROLE_LABELS[userRole]}". Tailor your answers to be especially relevant to their role.`
    : 'The user is not logged in. They may be exploring the platform or considering signing up.'

  return `You are KTIP Assistant, a friendly and helpful support assistant for the Knowledge, Technology and Innovation Platform (KTIP). KTIP is a Caribbean innovation and collaboration platform that connects students, mentors, entrepreneurs, investors, private sector partners, and OECS administrators.

${nameCtx}${roleCtx}

KTIP has these features:

PROJECTS: Users create, browse, and edit innovation projects. Projects have categories (Technology, Healthcare, Education, Agriculture, Environment), phases (Concept, Prototype, Funding, Launch), and hashtags. Project owners can receive comments and likes.

EVENTS: Create and browse hackathons, workshops, meetups, conferences, demo days, and challenges. Events can be virtual or in-person with location, dates, and capacity. Challenge events set a goal for attendees, with solutions the organizer is looking for.

GRANTS & FUNDING: Browse grant opportunities with amounts, deadlines, and eligibility. Logged-in users apply through a guided 5-step application wizard (Basics, Summary & Problem, Solution & Plan, Budget & Team, Impact & Review) with AI-powered content suggestions, AI review scoring, auto-save drafts, and rich text editing. Applications are tracked from "My Applications", where drafts can be resumed.

FORUMS: Community discussion boards with posts and replies. Browsing is public; posting requires login. Posts can be pinned.

MESSAGES: Real-time direct messaging between users, in a docked panel opened from the chat button at the bottom-right. Requires login.

COLLABORATION TOOLS: Whiteboard (visual brainstorming), Document Editor (shared writing), Code Editor (coding), Video Conference (video calls). All require login.

SETTINGS: Edit profile (name, bio, country, role), change password, update email, delete account.

AUTHENTICATION: Sign up with email/password or Google/Microsoft OAuth. Password reset available via email.

NAVIGATION: The main nav bar has links to Projects, Events, Grants, Forums, Messages, and Collaborate. Settings and profile are in the user menu (top right).

Rules:
- Use simple, clear language. Avoid jargon.
- Keep answers concise but complete (2-4 short paragraphs max).
- Reply in plain prose. Do not use markdown — no **bold**, no # headings, no - bullet lists. The chat renders your reply as plain text, so markdown shows up literally.
- If you do not know something specific, say so honestly.
- Only answer questions related to KTIP. For unrelated questions, politely redirect.
- When suggesting actions, mention which page or button to use (e.g., "Go to Projects and click Create Project").
- Be warm and encouraging, reflecting the Caribbean innovation spirit.
- Do not make up features that do not exist.`
}

function buildWelcomeMessage(userRole?: UserRole | null, userName?: string | null): string {
  const greeting = userName ? `Hi ${userName}!` : 'Hi there!'
  const roleHint = userRole
    ? ` As a ${ROLE_LABELS[userRole]}, I can help you get the most out of KTIP's features.`
    : ' Whether you are just exploring or already have an account, I am here to help.'

  return `${greeting} I am the KTIP Assistant.${roleHint}\n\nAsk me anything about projects, events, grants, grant applications, collaboration tools, or how to use the platform — or tell me where you want to go and I will take you there. What can I help you with?`
}

// --- Persistence ------------------------------------------------------------

interface StoredMessage extends Omit<ChatMessage, 'timestamp'> {
  timestamp: string
}

/**
 * Read a stored thread. `Date` does not survive JSON, so timestamps round-trip
 * as ISO strings. Any failure (private mode, quota, corrupt value) degrades to
 * an empty thread rather than throwing.
 */
export function loadThread(userId: string | undefined): ChatMessage[] | null {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredMessage[]
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }))
  } catch {
    return null
  }
}

export function saveThread(userId: string | undefined, messages: ChatMessage[]): void {
  if (!userId) return
  try {
    const trimmed = messages.slice(-MAX_PERSISTED)
    localStorage.setItem(
      `${STORAGE_PREFIX}${userId}`,
      JSON.stringify(trimmed.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() })))
    )
  } catch {
    // Storage unavailable or full — the thread still works in memory.
  }
}

export function clearStoredThread(userId: string | undefined): void {
  if (!userId) return
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${userId}`)
  } catch {
    // Nothing to do.
  }
}

// --- API calls --------------------------------------------------------------

interface NavigatorResult {
  answer: string
  steps: string[]
  destinations: AssistantDestination[]
}

async function callChat(
  apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): Promise<string> {
  const res = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: apiMessages, temperature: 0.7, max_tokens: 1000 }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`AI error: ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.'
}

/**
 * The same site-map navigator the navbar search uses. Ids it returns are
 * already validated server-side against SITE_ENTRY_IDS, so anything reaching
 * `resolveDestinations` is a real entry.
 */
async function callNavigator(
  query: string,
  viewer: { signedIn: boolean; isOecs: boolean }
): Promise<NavigatorResult> {
  const res = await fetch('/api/ai-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, signedIn: viewer.signedIn, isOecs: viewer.isOecs }),
  })

  if (!res.ok) throw new Error(`Navigator error: ${res.status}`)

  const data = await res.json()
  return {
    answer: typeof data.answer === 'string' ? data.answer : '',
    steps: Array.isArray(data.steps) ? data.steps.filter((s: unknown) => typeof s === 'string') : [],
    destinations: resolveDestinations(Array.isArray(data.ids) ? data.ids : [], viewer),
  }
}

// --- Hook -------------------------------------------------------------------

export interface UseAIAssistantOptions {
  userId?: string | null
  userRole?: UserRole | null
  userName?: string | null
  isOecs?: boolean
}

/**
 * The KTIP Assistant thread.
 *
 * Every turn fires both AI endpoints in parallel: `/api/ai-chat` for the
 * conversational reply and `/api/ai-search` for platform navigation. The
 * navigator is an enhancement — if it fails the turn still succeeds with the
 * reply alone, and no error is surfaced.
 */
export function useAIAssistant(options?: UseAIAssistantOptions) {
  const userId = options?.userId ?? undefined
  const role = options?.userRole
  const name = options?.userName
  const isOecs = options?.isOecs ?? false
  const signedIn = !!userId

  // Computed once, at mount — the welcome text depends only on identity.
  const welcomeMsgRef = useRef<ChatMessage | null>(null)
  if (!welcomeMsgRef.current) {
    welcomeMsgRef.current = {
      id: 'welcome',
      role: 'assistant',
      content: buildWelcomeMessage(role, name),
      timestamp: new Date(),
    }
  }
  const welcomeMsg = welcomeMsgRef.current

  const [messages, setMessages] = useState<ChatMessage[]>(
    () => loadThread(userId) ?? [welcomeMsg]
  )
  const [error, setError] = useState<string | null>(null)

  // Persist on every change. Skipping the welcome-only state keeps a fresh
  // thread from writing a key nobody asked for.
  useEffect(() => {
    if (messages.length <= 1) return
    saveThread(userId, messages)
  }, [userId, messages])

  const mutation = useMutation({
    mutationFn: async (trimmed: string): Promise<ChatMessage> => {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      }

      // React state updates are async, so mirror the post-append list locally
      // to build the request body from the correct history.
      let updatedMessages: ChatMessage[] = []
      setMessages((prev) => {
        updatedMessages = [...prev, userMsg]
        return updatedMessages
      })

      const history = updatedMessages.filter((m) => m.id !== 'welcome').slice(-MAX_HISTORY)
      const apiMessages = [
        { role: 'system' as const, content: buildSystemPrompt(role, name) },
        // Include welcome as first assistant message for context
        { role: 'assistant' as const, content: welcomeMsg.content },
        ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: trimmed },
      ]

      const [chat, nav] = await Promise.allSettled([
        callChat(apiMessages),
        callNavigator(trimmed, { signedIn, isOecs }),
      ])

      const navResult = nav.status === 'fulfilled' ? nav.value : null

      // Chat is the primary voice; the navigator's own answer is the fallback
      // when chat is down, since it is already written as human sentences.
      let content: string
      if (chat.status === 'fulfilled') {
        content = chat.value
      } else if (navResult?.answer) {
        content = navResult.answer
      } else {
        throw chat.reason instanceof Error ? chat.reason : new Error('AI request failed')
      }

      return {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: new Date(),
        steps: navResult?.steps.length ? navResult.steps : undefined,
        destinations: navResult?.destinations.length ? navResult.destinations : undefined,
      }
    },
    onSuccess: (assistantMsg) => {
      setMessages((prev) => [...prev, assistantMsg])
    },
    onError: (err: any) => {
      setError(err?.message || 'Something went wrong. Please try again.')
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I ran into an issue. Please try asking again in a moment.',
          timestamp: new Date(),
        },
      ])
    },
  })

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || mutation.isPending) return

      setError(null)
      try {
        await mutation.mutateAsync(trimmed)
      } catch {
        // error state already recorded via onError
      }
    },
    [mutation]
  )

  const clearHistory = useCallback(() => {
    const nextWelcome: ChatMessage = {
      ...welcomeMsg,
      id: `welcome-${Date.now()}`,
      timestamp: new Date(),
    }
    welcomeMsgRef.current = nextWelcome
    setMessages([nextWelcome])
    setError(null)
    clearStoredThread(userId)
  }, [welcomeMsg, userId])

  return { messages, loading: mutation.isPending, error, sendMessage, clearHistory }
}
