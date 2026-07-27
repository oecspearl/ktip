import { createSignal, createEffect, Show, For, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import { MessageCircle, X, Send, Trash2, Loader2 } from 'lucide-solid'
import { useAuth } from '../../contexts/AuthContext'
import { useAIAssistant } from '../../hooks/useAIAssistant'
import type { ChatMessage } from '../../hooks/useAIAssistant'

export function AIAssistant() {
  const auth = useAuth()
  const [open, setOpen] = createSignal(false)
  const [input, setInput] = createSignal('')

  let messagesEndRef: HTMLDivElement | undefined

  const assistant = useAIAssistant({
    userRole: auth.profile()?.roles?.[0] ?? null,
    userName: auth.profile()?.display_name ?? null,
  })

  // Auto-scroll to bottom when messages change
  createEffect(() => {
    assistant.messages()
    if (messagesEndRef) {
      setTimeout(() => messagesEndRef?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  })

  const handleSend = () => {
    const msg = input().trim()
    if (!msg) return
    setInput('')
    assistant.sendMessage(msg)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Close on Escape
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open()) setOpen(false)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleEscape)
    onCleanup(() => window.removeEventListener('keydown', handleEscape))
  }

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <Portal>
      {/* Toggle Button */}
      <button
        type="button"
        onClick={() => setOpen(!open())}
        aria-label={open() ? 'Close help assistant' : 'Open help assistant'}
        class={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-medium transition-all duration-200 hover:scale-105 ${
          open()
            ? 'bg-ktip-sand-600 hover:bg-ktip-sand-700'
            : 'bg-gradient-to-r from-ktip-ocean-500 to-ktip-ocean-600 hover:from-ktip-ocean-600 hover:to-ktip-ocean-700'
        } text-white`}
      >
        <Show when={open()} fallback={<MessageCircle size={24} />}>
          <X size={24} />
        </Show>
      </button>

      {/* Chat Panel */}
      <Show when={open()}>
        <div class="fixed bottom-24 right-6 z-50 w-[380px] max-h-[520px] sm:w-[380px] max-sm:left-4 max-sm:right-4 max-sm:w-auto bg-white rounded-2xl shadow-hard border border-ktip-sand-100 flex flex-col overflow-hidden animate-scale-in">
          {/* Header */}
          <div class="flex items-center justify-between px-5 py-4 border-b border-ktip-sand-100 bg-gradient-to-r from-ktip-ocean-500 to-ktip-ocean-600">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircle size={16} class="text-white" />
              </div>
              <div>
                <h3 class="text-sm font-semibold text-white">KTIP Assistant</h3>
                <p class="text-xs text-white/70">Ask me anything</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => assistant.clearHistory()}
              title="Clear chat history"
              class="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Messages */}
          <div class="flex-1 overflow-y-auto p-4 space-y-3 min-h-[280px] max-h-[360px]">
            <For each={assistant.messages()}>
              {(msg: ChatMessage) => (
                <div
                  class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    class={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-ktip-ocean-500 text-white rounded-2xl rounded-br-md'
                        : 'bg-ktip-sand-50 border border-ktip-sand-200 text-ktip-sand-900 rounded-2xl rounded-bl-md'
                    }`}
                  >
                    <p class="whitespace-pre-wrap">{msg.content}</p>
                    <p
                      class={`text-[10px] mt-1 ${
                        msg.role === 'user' ? 'text-white/60' : 'text-ktip-sand-400'
                      }`}
                    >
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              )}
            </For>

            {/* Typing indicator */}
            <Show when={assistant.loading()}>
              <div class="flex justify-start">
                <div class="bg-ktip-sand-50 border border-ktip-sand-200 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                  <div
                    class="w-2 h-2 bg-ktip-sand-400 rounded-full animate-bounce"
                    style={{ 'animation-delay': '0ms' }}
                  />
                  <div
                    class="w-2 h-2 bg-ktip-sand-400 rounded-full animate-bounce"
                    style={{ 'animation-delay': '150ms' }}
                  />
                  <div
                    class="w-2 h-2 bg-ktip-sand-400 rounded-full animate-bounce"
                    style={{ 'animation-delay': '300ms' }}
                  />
                </div>
              </div>
            </Show>

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div class="border-t border-ktip-sand-100 p-3">
            <div class="flex items-end gap-2">
              <textarea
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your question..."
                rows={1}
                class="flex-1 resize-none px-4 py-2.5 text-sm bg-ktip-sand-50 border border-ktip-sand-200 rounded-xl text-ktip-sand-900 placeholder:text-ktip-sand-400 focus:border-ktip-ocean-500 focus:ring-1 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={assistant.loading() || !input().trim()}
                class="p-2.5 bg-ktip-ocean-500 text-white rounded-xl hover:bg-ktip-ocean-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                aria-label="Send message"
              >
                <Show
                  when={!assistant.loading()}
                  fallback={<Loader2 size={18} class="animate-spin" />}
                >
                  <Send size={18} />
                </Show>
              </button>
            </div>
          </div>
        </div>
      </Show>
    </Portal>
  )
}
