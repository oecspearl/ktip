import { Download, FileText, Image as ImageIcon } from 'lucide-react'
import type { Message, MessageAttachment } from '../../types'
import { formatRelativeTime } from '../../lib/utils'
import { formatFileSize, isImageAttachment } from '../../lib/chat-attachments'
import { useAttachmentUrl } from '../../hooks/useMessages'
import { ReportButton } from '../moderation/ReportButton'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { LinkedText } from '../ui/LinkedText'
import { useLingui } from '@lingui/react/macro'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
}

/**
 * One attached file.
 *
 * The bucket is private, so both the thumbnail and the download link hang off
 * a signed URL. Until it arrives the card still shows the file's name and size
 * — the useful part of an attachment is knowing what it is, and that is
 * already in the message row.
 */
function AttachmentCard({ attachment, isOwn }: { attachment: MessageAttachment; isOwn: boolean }) {
  const { url } = useAttachmentUrl(attachment.path)
  const isImage = isImageAttachment(attachment)

  const frame = isOwn
    ? 'border-white/30 bg-white/10 hover:bg-white/20'
    : 'border-ktip-sand-200 bg-white hover:bg-ktip-sand-50'
  const meta = isOwn ? 'text-white/70' : 'text-ktip-sand-500'

  if (isImage) {
    return (
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!url}
        className={`block overflow-hidden rounded-xl border ${frame} ${
          url ? '' : 'pointer-events-none'
        }`}
      >
        {url ? (
          <img
            src={url}
            alt={attachment.name}
            loading="lazy"
            className="max-h-64 w-full object-cover"
          />
        ) : (
          <div className="flex h-24 items-center justify-center">
            <ImageIcon size={18} className={meta} aria-hidden="true" />
          </div>
        )}
        <span className={`block truncate px-2.5 py-1.5 text-[11px] ${meta}`}>
          {attachment.name} · {formatFileSize(attachment.size)}
        </span>
      </a>
    )
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.name}
      aria-disabled={!url}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors ${frame} ${
        url ? '' : 'pointer-events-none opacity-70'
      }`}
    >
      <FileText size={16} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{attachment.name}</span>
        <span className={`block text-[11px] ${meta}`}>{formatFileSize(attachment.size)}</span>
      </span>
      <Download size={14} className={`shrink-0 ${meta}`} aria-hidden="true" />
    </a>
  )
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const { t } = useLingui()
  const senderName = message.sender?.display_name || t`Unknown`
  const attachments = message.attachments ?? []
  const hasText = message.content.trim().length > 0

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`flex gap-2 max-w-[75%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar for other users */}
        {!isOwn && (
          <DiamondAvatar
            src={message.sender?.avatar_url}
            name={senderName}
            size={32}
            className="mt-1"
          />
        )}

        <div className="group min-w-0">
          {/* Sender name for other users */}
          {!isOwn && (
            <div className="flex items-center gap-1 mb-1 ml-1">
              <p className="text-xs text-ktip-sand-500">{senderName}</p>
              <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <ReportButton
                  targetType="message"
                  targetId={message.id}
                  targetAuthorId={message.sender_id}
                  contentSnapshot={message.content}
                  targetLabel="this message"
                  className="!p-0.5"
                />
              </span>
            </div>
          )}

          {/* Message bubble */}
          <div
            className={`px-4 py-2.5 ${
              isOwn
                ? 'bg-ktip-ocean-500 dark:bg-ktip-ocean-200 text-white rounded-2xl rounded-br-md'
                : 'bg-ktip-cream border border-ktip-sand-200 text-ktip-sand-900 rounded-2xl rounded-bl-md'
            }`}
          >
            {attachments.length > 0 && (
              <div className={`flex flex-col gap-1.5 ${hasText ? 'mb-2' : ''}`}>
                {attachments.map((attachment) => (
                  <AttachmentCard
                    key={attachment.path}
                    attachment={attachment}
                    isOwn={isOwn}
                  />
                ))}
              </div>
            )}

            {hasText && (
              <p className="text-sm whitespace-pre-wrap break-words">
                <LinkedText
                  text={message.content}
                  linkClassName={isOwn ? 'text-white' : 'text-ktip-ocean-600'}
                />
              </p>
            )}
          </div>

          {/* Timestamp */}
          <p
            className={`text-xs text-ktip-sand-400 mt-1 ${
              isOwn ? 'text-right mr-1' : 'ml-1'
            }`}
          >
            {formatRelativeTime(message.created_at)}
          </p>
        </div>
      </div>
    </div>
  )
}
