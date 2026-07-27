import { createSignal, createEffect, Show, For } from 'solid-js'
import { Send } from 'lucide-solid'
import { Button } from '../ui/Button'
import { MessageBubble } from './MessageBubble'
import { useMessages, useRealtimeMessages, useSendMessage } from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import type { Message } from '../../types'

interface ChatWindowProps {
  conversationId: string
  otherUserName?: string
}

export function ChatWindow(props: ChatWindowProps) {
  const auth = useAuth()
  const { messages: fetchedMessages } = useMessages(() => props.conversationId)
  const { sendMessage, loading } = useSendMessage()

  const [localMessages, setLocalMessages] = createSignal<Message[]>([])
  const [input, setInput] = createSignal('')
  let messagesEndRef: HTMLDivElement | undefined

  // Sync fetched messages to local state
  createEffect(() => {
    const msgs = fetchedMessages()
    if (msgs) {
      setLocalMessages(msgs)
    }
  })

  // Realtime: append new messages
  useRealtimeMessages(
    () => props.conversationId,
    (newMsg) => {
      // Avoid duplicates (if the sender is us, we already added it optimistically)
      setLocalMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev
        return [...prev, newMsg]
      })
    }
  )

  // Auto-scroll to bottom
  createEffect(() => {
    localMessages() // track dependency
    setTimeout(() => {
      messagesEndRef?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  })

  const handleSend = async (e: Event) => {
    e.preventDefault()
    const content = input().trim()
    if (!content || !auth.user()) return

    setInput('')

    try {
      const sent = await sendMessage({
        conversation_id: props.conversationId,
        sender_id: auth.user()!.id,
        content,
      })
      if (sent) {
        // Add to local messages if not already there from realtime
        setLocalMessages((prev) => {
          if (prev.some((m) => m.id === (sent as any).id)) return prev
          return [...prev, sent as unknown as Message]
        })
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="p-4 border-b border-ktip-sand-200 bg-white">
        <h3 class="font-display font-bold text-ktip-sand-900">
          {props.otherUserName || 'Conversation'}
        </h3>
      </div>

      {/* Messages area */}
      <div class="flex-1 overflow-y-auto p-4 bg-ktip-canvas">
        <Show
          when={localMessages().length}
          fallback={
            <div class="flex items-center justify-center h-full text-ktip-sand-500">
              <p class="text-sm">Start the conversation!</p>
            </div>
          }
        >
          <For each={localMessages()}>
            {(message) => (
              <MessageBubble
                message={message}
                isOwn={message.sender_id === auth.user()?.id}
              />
            )}
          </For>
        </Show>
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} class="p-4 border-t border-ktip-sand-200 bg-white">
        <div class="flex items-end gap-3">
          <textarea
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            class="flex-1 border-2 border-ktip-sand-200 rounded-xl px-4 py-2.5 resize-none transition-colors focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input().trim() || loading()}
            icon={<Send size={18} />}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  )
}
