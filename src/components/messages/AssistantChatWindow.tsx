import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { Send, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { AssistantBubble } from './AssistantBubble'
import { useAIAssistant } from '../../hooks/useAIAssistant'
import { useAuth } from '../../contexts/AuthContext'
import { ASSISTANT_NAME, ASSISTANT_TAGLINE } from '../../lib/assistant'

/**
 * The KTIP Assistant thread. Same shape as ChatWindow — header, scrollable
 * messages, composer — but backed by the AI hook rather than the database:
 * no useMessages, no realtime, nothing to persist server-side.
 */
export function AssistantChatWindow() {
  const auth = useAuth()
  const navigate = useNavigate()

  const assistant = useAIAssistant({
    userId: auth.user?.id,
    userRole: auth.profile?.roles?.[0] ?? null,
    userName: auth.profile?.display_name ?? null,
    isOecs: auth.profile?.roles?.includes('oecs') ?? false,
  })

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    const timeout = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
    return () => clearTimeout(timeout)
  }, [assistant.messages, assistant.loading])

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    const content = input.trim()
    if (!content || assistant.loading) return

    setInput('')
    await assistant.sendMessage(content)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  // The panel is non-modal and docked, so it stays open — the user watches the
  // page change behind it and can keep asking follow-ups.
  const handleNavigate = (href: string) => navigate(href)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-ktip-sand-200 bg-ktip-cream flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white shrink-0">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-ktip-sand-900 truncate">{ASSISTANT_NAME}</h3>
            <p className="text-xs text-ktip-sand-500 truncate">{ASSISTANT_TAGLINE}</p>
          </div>
        </div>
        <button
          onClick={assistant.clearHistory}
          className="p-2 text-ktip-sand-500 hover:text-ktip-sand-900 hover:bg-ktip-sand-50 rounded-lg transition-colors shrink-0"
          aria-label="Clear conversation"
          title="Clear conversation"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 bg-ktip-canvas">
        {assistant.messages.map((message) => (
          <AssistantBubble key={message.id} message={message} onNavigate={handleNavigate} />
        ))}

        {assistant.loading && (
          <div className="flex justify-start mb-3">
            <div className="ml-10 bg-ktip-cream border border-ktip-sand-200 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
              <div
                className="w-2 h-2 bg-ktip-sand-400 rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <div
                className="w-2 h-2 bg-ktip-sand-400 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <div
                className="w-2 h-2 bg-ktip-sand-400 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="p-4 border-t border-ktip-sand-200 bg-ktip-cream">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question, or say where you want to go..."
            aria-label={`Message ${ASSISTANT_NAME}`}
            rows={1}
            className="flex-1 border-2 border-ktip-sand-200 rounded-xl px-4 py-2.5 resize-none transition-colors focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || assistant.loading}
            icon={<Send size={18} />}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  )
}
