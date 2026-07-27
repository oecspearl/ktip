import { createSignal } from 'solid-js'
import type { UserRole } from '../types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const MAX_HISTORY = 20

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Student',
  mentor: 'Mentor',
  investor: 'Investor',
  entrepreneur: 'Entrepreneur',
  private_sector: 'Private Sector Partner',
  oecs: 'OECS Administrator',
}

function buildSystemPrompt(userRole?: UserRole | null, userName?: string | null): string {
  const nameCtx = userName ? `The user's name is ${userName}. ` : ''
  const roleCtx = userRole
    ? `The user is logged in as a "${ROLE_LABELS[userRole]}". Tailor your answers to be especially relevant to their role.`
    : 'The user is not logged in. They may be exploring the platform or considering signing up.'

  return `You are KTIP Assistant, a friendly and helpful support assistant for the Knowledge, Technology and Innovation Platform (KTIP). KTIP is a Caribbean innovation and collaboration platform that connects students, mentors, entrepreneurs, investors, private sector partners, and OECS administrators.

${nameCtx}${roleCtx}

KTIP has these features:

PROJECTS: Users create, browse, and edit innovation projects. Projects have categories (Technology, Healthcare, Education, Agriculture, Environment), phases (Concept, Prototype, Funding, Launch), hashtags, and can be linked to proposals. Project owners can receive comments and likes.

EVENTS: Create and browse hackathons, workshops, meetups, conferences, and demo days. Events can be virtual or in-person with location, dates, and capacity.

GRANTS & FUNDING: Browse grant opportunities with amounts, deadlines, and eligibility. Logged-in users can apply and track applications from "My Applications".

FORUMS: Community discussion boards with posts and replies. Browsing is public; posting requires login. Posts can be pinned.

MESSAGES: Real-time direct messaging between users. Requires login.

PROPOSALS: A guided wizard for four proposal types — Funding/Grant, Project, Research, Business. Includes AI-powered content suggestions, AI review scoring, auto-save, rich text editing, shareable links, and PDF/Word export. Proposals can be linked to projects.

COLLABORATION TOOLS: Whiteboard (visual brainstorming), Document Editor (shared writing), Code Editor (coding), Video Conference (video calls). All require login.

SETTINGS: Edit profile (name, bio, country, role), change password, update email, delete account.

AUTHENTICATION: Sign up with email/password or Google/Microsoft OAuth. Password reset available via email.

NAVIGATION: The main nav bar has links to Projects, Events, Grants, Forums, Messages, and Collaborate. Settings and profile are in the user menu (top right).

Rules:
- Use simple, clear language. Avoid jargon.
- Keep answers concise but complete (2-4 short paragraphs max).
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

  return `${greeting} I am the KTIP Assistant.${roleHint}\n\nAsk me anything about projects, events, grants, proposals, collaboration tools, or how to use the platform. What can I help you with?`
}

export function useAIAssistant(options?: {
  userRole?: UserRole | null
  userName?: string | null
}) {
  const role = options?.userRole
  const name = options?.userName

  const welcomeMsg: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: buildWelcomeMessage(role, name),
    timestamp: new Date(),
  }

  const [messages, setMessages] = createSignal<ChatMessage[]>([welcomeMsg])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const sendMessage = async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || loading()) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setLoading(true)
    setError(null)

    try {
      // Build conversation for API — system prompt + recent history
      const history = messages()
        .filter((m) => m.id !== 'welcome')
        .slice(-MAX_HISTORY)
      const apiMessages = [
        { role: 'system' as const, content: buildSystemPrompt(role, name) },
        // Include welcome as first assistant message for context
        { role: 'assistant' as const, content: welcomeMsg.content },
        ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: trimmed },
      ]

      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`AI error: ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`)
      }

      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.'

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMsg])
    } catch (err: any) {
      const msg = err?.message || 'Something went wrong. Please try again.'
      setError(msg)

      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I ran into an issue. Please try asking again in a moment.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  const clearHistory = () => {
    setMessages([
      {
        ...welcomeMsg,
        id: `welcome-${Date.now()}`,
        timestamp: new Date(),
      },
    ])
    setError(null)
  }

  return { messages, loading, error, sendMessage, clearHistory }
}
