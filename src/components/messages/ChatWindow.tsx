import {
  useState,
  useEffect,
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Paperclip, Send, Settings, Upload, Users, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { EmojiPickerButton, insertAtCaret } from '../ui/EmojiPicker'
import { MessageBubble } from './MessageBubble'
import { GroupSettingsModal } from './GroupSettingsModal'
import {
  useMarkConversationRead,
  useMessages,
  useRealtimeMessages,
  useSendMessage,
} from '../../hooks/useMessages'
import { useAuth } from '../../contexts/AuthContext'
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  attachmentRejection,
  discardAttachments,
  formatFileSize,
  uploadAttachment,
} from '../../lib/chat-attachments'
import type { Conversation, MessageAttachment } from '../../types'
import { Plural, Trans, useLingui } from '@lingui/react/macro'

interface ChatWindowProps {
  conversationId: string
  otherUserName?: string
  conversation?: Conversation
  onLeftGroup?: () => void
}

export function ChatWindow({ conversationId, otherUserName, conversation, onLeftGroup }: ChatWindowProps) {
  const { t } = useLingui()
  const auth = useAuth()
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const isGroup = conversation?.is_group ?? false
  // The query cache is the single source of truth: realtime INSERTs and our
  // own sends both land there (useRealtimeMessages / useSendMessage), so a
  // local mirror only produced duplicate state updates per incoming message.
  const { messages } = useMessages(conversationId)
  const { sendMessage, loading } = useSendMessage()
  const { markRead } = useMarkConversationRead(auth.user?.id)

  const [input, setInput] = useState('')
  // Files staged for the next send. They are uploaded on submit, not on drop,
  // so a member can drop the wrong thing and simply take it back off.
  const [staged, setStaged] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  // Counted, not a boolean: dragging over a child fires dragleave on the
  // parent, and a boolean flickers the overlay off on every inner element.
  const [dragDepth, setDragDepth] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  // Held so the emoji picker can insert at the caret rather than on the end.
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Realtime: writes into the query cache inside the hook.
  useRealtimeMessages(conversationId)

  // Looking at the thread is what clears its share of the FAB dot. Keyed on the
  // message count as well as the id, so a message that lands while the thread is
  // already open does not relight the dot behind the panel.
  useEffect(() => {
    if (!auth.user) return
    markRead(conversationId).catch((err) => {
      console.error('Failed to mark conversation read:', err)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages?.length, auth.user?.id])

  // Auto-scroll to bottom
  useEffect(() => {
    const timeout = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
    return () => clearTimeout(timeout)
  }, [messages])

  // Switching threads must not carry a staged file into a different
  // conversation — the note it belonged to is no longer on screen.
  useEffect(() => {
    setStaged([])
    setAttachError(null)
    setDragDepth(0)
  }, [conversationId])

  const stageFiles = (incoming: File[]) => {
    if (incoming.length === 0) return

    const accepted: File[] = []
    const problems: string[] = []

    for (const file of incoming) {
      const rejection = attachmentRejection(file)
      if (rejection) {
        problems.push(rejection)
        continue
      }
      accepted.push(file)
    }

    setStaged((current) => {
      const room = MAX_ATTACHMENTS_PER_MESSAGE - current.length
      if (accepted.length > room) {
        problems.push(t`A message can carry ${MAX_ATTACHMENTS_PER_MESSAGE} files at most.`)
      }
      return [...current, ...accepted.slice(0, Math.max(room, 0))]
    })

    setAttachError(problems.length > 0 ? problems[0] : null)
  }

  const unstage = (index: number) => {
    setStaged((current) => current.filter((_, i) => i !== index))
    setAttachError(null)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragDepth(0)
    stageFiles(Array.from(e.dataTransfer?.files ?? []))
  }

  const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  const handleDragEnter = (e: DragEvent) => {
    if (!carriesFiles(e)) return
    e.preventDefault()
    setDragDepth((depth) => depth + 1)
  }

  const handleDragOver = (e: DragEvent) => {
    if (!carriesFiles(e)) return
    // Without this the browser navigates away to the dropped file.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = () => {
    setDragDepth((depth) => Math.max(0, depth - 1))
  }

  // Screenshots arrive on the clipboard, not through a file dialog.
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? [])
    if (files.length === 0) return
    e.preventDefault()
    stageFiles(files)
  }

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    const content = input.trim()
    if ((!content && staged.length === 0) || !auth.user || uploading) return

    const files = staged
    setInput('')
    setStaged([])
    setAttachError(null)

    let uploaded: MessageAttachment[] = []

    try {
      if (files.length > 0) {
        setUploading(true)
        // Sequential: a thread of five 25MB uploads at once is worse for the
        // member on a Caribbean mobile link than five that finish in order.
        for (const file of files) {
          uploaded.push(await uploadAttachment({ conversationId, senderId: auth.user.id, file }))
        }
      }

      await sendMessage({
        conversation_id: conversationId,
        sender_id: auth.user.id,
        content,
        attachments: uploaded,
      })
      uploaded = []
    } catch (err) {
      console.error('Failed to send message:', err)
      // Give the member their draft back — the alternative is retyping a note
      // and re-finding files they already chose.
      setInput((current) => current || content)
      setStaged(files)
      setAttachError(err instanceof Error ? err.message : t`That message could not be sent.`)
      // Blobs whose message never landed are invisible to everyone; drop them.
      await discardAttachments(uploaded.map((a) => a.path))
    } finally {
      setUploading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  const busy = loading || uploading
  const canSend = (input.trim().length > 0 || staged.length > 0) && !busy

  return (
    <div
      className="relative flex flex-col h-full"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="p-4 border-b border-ktip-sand-200 bg-ktip-cream flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold text-ktip-sand-900 truncate flex items-center gap-2">
            {isGroup && <Users size={16} className="text-ktip-ocean-600 shrink-0" />}
            {(isGroup ? conversation?.name || t`Group` : otherUserName) || t`Conversation`}
          </h3>
          {isGroup && (
            <p className="text-xs text-ktip-sand-500">
              <Plural value={conversation?.participants?.length || 0} one="# member" other="# members" />
            </p>
          )}
        </div>
        {isGroup && conversation && (
          <>
            <button
              onClick={() => setShowGroupSettings(true)}
              className="p-2 text-ktip-sand-500 hover:text-ktip-sand-900 hover:bg-ktip-sand-50 rounded-lg transition-colors shrink-0"
              aria-label={t`Group settings`}
            >
              <Settings size={18} />
            </button>
            <GroupSettingsModal
              open={showGroupSettings}
              onClose={() => setShowGroupSettings(false)}
              conversation={conversation}
              onLeft={onLeftGroup}
            />
          </>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 bg-ktip-canvas">
        {messages?.length ? (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.sender_id === auth.user?.id}
            />
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-ktip-sand-500">
            <p className="text-sm"><Trans>Start the conversation!</Trans></p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="p-4 border-t border-ktip-sand-200 bg-ktip-cream">
        {staged.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {staged.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-xl border border-ktip-sand-200 bg-white px-3 py-1.5 text-xs text-ktip-sand-700"
              >
                <Paperclip size={13} className="shrink-0 text-ktip-ocean-600" aria-hidden="true" />
                <span className="max-w-[12rem] truncate font-medium">{file.name}</span>
                <span className="text-ktip-sand-400">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  onClick={() => unstage(index)}
                  disabled={busy}
                  aria-label={t`Remove ${file.name}`}
                  className="rounded-md p-0.5 text-ktip-sand-400 transition-colors hover:bg-ktip-sand-100 hover:text-red-600 disabled:opacity-40"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {attachError && (
          <p role="alert" className="mb-2 text-xs text-red-600">
            {attachError}
          </p>
        )}

        <div className="flex items-end gap-2">
          <EmojiPickerButton
            className="shrink-0 pb-1"
            onPick={(emoji) => setInput((value) => insertAtCaret(inputRef.current, value, emoji))}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              stageFiles(Array.from(e.target.files ?? []))
              // Reset, so choosing the same file twice in a row still fires.
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || staged.length >= MAX_ATTACHMENTS_PER_MESSAGE}
            aria-label={t`Attach a file`}
            title={t`Attach a file`}
            className="shrink-0 rounded-lg p-2 pb-1 text-ktip-sand-500 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-ocean-600 disabled:opacity-40"
          >
            <Paperclip size={18} aria-hidden="true" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={staged.length > 0 ? t`Add a note to these files…` : t`Type a message...`}
            rows={1}
            className="flex-1 border-2 border-ktip-sand-200 rounded-xl px-4 py-2.5 resize-none transition-colors focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!canSend}
            icon={<Send size={18} />}
          >
            {uploading ? t`Sending…` : t`Send`}
          </Button>
        </div>
      </form>

      {dragDepth > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-ktip-ocean-500 bg-ktip-ocean-500/10 backdrop-blur-[1px]">
          <div className="rounded-2xl bg-white/95 px-5 py-3 text-center shadow-lg">
            <Upload size={20} className="mx-auto mb-1 text-ktip-ocean-600" aria-hidden="true" />
            <p className="text-sm font-semibold text-ktip-sand-900"><Trans>Drop to attach</Trans></p>
            <p className="text-xs text-ktip-sand-500">
              <Trans>Up to {MAX_ATTACHMENTS_PER_MESSAGE} files, with a note if you like</Trans>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
