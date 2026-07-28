import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, X, Send, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAIAssistant } from '../../hooks/useAIAssistant'
import type { ChatMessage } from '../../hooks/useAIAssistant'

export function AIAssistant() {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const assistant = useAIAssistant({
    userRole: auth.profile?.roles?.[0] ?? null,
    userName: auth.profile?.display_name ?? null,
  })

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
    return () => clearTimeout(timer)
  }, [assistant.messages])

  const handleSend = () => {
    const msg = input.trim()
    if (!msg) return
    setInput('')
    assistant.sendMessage(msg)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open])

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return createPortal(
    <>
      {/* Toggle Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close help assistant' : 'Open help assistant'}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-medium transition-all duration-200 hover:scale-105 ${
          open
            ? 'bg-ktip-sand-600 hover:bg-ktip-sand-700'
            : 'bg-gradient-to-r from-ktip-ocean-500 to-ktip-ocean-600 hover:from-ktip-ocean-600 hover:to-ktip-ocean-700'
        } text-white`}
      >
        {open ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[520px] sm:w-[380px] max-sm:left-4 max-sm:right-4 max-sm:w-auto bg-ktip-cream rounded-2xl shadow-hard border border-ktip-sand-100 flex flex-col overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-ktip-sand-100 bg-gradient-to-r from-ktip-ocean-500 to-ktip-ocean-600">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircle size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">KTIP Assistant</h3>
                <p className="text-xs text-white/70">Ask me anything</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => assistant.clearHistory()}
              title="Clear chat history"
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[280px] max-h-[360px]">
            {assistant.messages.map((msg: ChatMessage) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-ktip-ocean-500 text-white rounded-2xl rounded-br-md'
                      : 'bg-ktip-sand-50 border border-ktip-sand-200 text-ktip-sand-900 rounded-2xl rounded-bl-md'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p
                    className={`text-[10px] mt-1 ${
                      msg.role === 'user' ? 'text-white/60' : 'text-ktip-sand-400'
                    }`}
                  >
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {assistant.loading && (
              <div className="flex justify-start">
                <div className="bg-ktip-sand-50 border border-ktip-sand-200 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
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

          {/* Input */}
          <div className="border-t border-ktip-sand-100 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your question..."
                rows={1}
                className="flex-1 resize-none px-4 py-2.5 text-sm bg-ktip-sand-50 border border-ktip-sand-200 rounded-xl text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-500 focus:ring-1 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={assistant.loading || !input.trim()}
                className="p-2.5 bg-ktip-ocean-500 text-white rounded-xl hover:bg-ktip-ocean-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                aria-label="Send message"
              >
                {!assistant.loading ? <Send size={18} /> : <Loader2 size={18} className="animate-spin" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  )
}
