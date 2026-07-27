import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '../ui/Button'
import { MessageBubble } from './MessageBubble'
import { useMessages, useRealtimeMessages, useSendMessage } from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import type { Message } from '../../types'

interface ChatWindowProps {
  conversationId: string
  otherUserName?: string
}

export function ChatWindow({ conversationId, otherUserName }: ChatWindowProps) {
  const auth = useAuth()
  const { messages: fetchedMessages } = useMessages(conversationId)
  const { sendMessage, loading } = useSendMessage()

  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Sync fetched messages to local state
  useEffect(() => {
    if (fetchedMessages) {
      setLocalMessages(fetchedMessages)
    }
  }, [fetchedMessages])

  // Realtime: append new messages
  useRealtimeMessages(conversationId, (newMsg) => {
    // Avoid duplicates (if the sender is us, we already added it optimistically)
    setLocalMessages((prev) => {
      if (prev.some((m) => m.id === newMsg.id)) return prev
      return [...prev, newMsg]
    })
  })

  // Auto-scroll to bottom
  useEffect(() => {
    const timeout = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
    return () => clearTimeout(timeout)
  }, [localMessages])

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    const content = input.trim()
    if (!content || !auth.user) return

    setInput('')

    try {
      const sent = await sendMessage({
        conversation_id: conversationId,
        sender_id: auth.user.id,
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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-ktip-sand-200 bg-white">
        <h3 className="font-display font-bold text-ktip-sand-900">
          {otherUserName || 'Conversation'}
        </h3>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 bg-ktip-canvas">
        {localMessages.length ? (
          localMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.sender_id === auth.user?.id}
            />
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-ktip-sand-500">
            <p className="text-sm">Start the conversation!</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="p-4 border-t border-ktip-sand-200 bg-white">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 border-2 border-ktip-sand-200 rounded-xl px-4 py-2.5 resize-none transition-colors focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || loading}
            icon={<Send size={18} />}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  )
}
