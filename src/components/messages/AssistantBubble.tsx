import { ArrowUpRight, Sparkles } from 'lucide-react'
import { resolveIcon } from '../../lib/icon-map'
import { ASSISTANT_NAME } from '../../lib/assistant'
import { formatRelativeTime } from '../../lib/utils'
import type { ChatMessage } from '../../hooks/useAIAssistant'

interface AssistantBubbleProps {
  message: ChatMessage
  onNavigate: (href: string) => void
}

/**
 * One turn in the assistant thread. Styled to match MessageBubble so the
 * assistant reads as a contact, with two extras the site-map navigator can
 * attach: numbered steps and clickable destinations.
 */
export function AssistantBubble({ message, onNavigate }: AssistantBubbleProps) {
  const isOwn = message.role === 'user'
  const steps = message.steps ?? []
  const destinations = message.destinations ?? []

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`flex gap-2 max-w-[85%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isOwn && (
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white shrink-0 mt-1">
            <Sparkles size={14} />
          </div>
        )}

        <div className="min-w-0">
          {!isOwn && <p className="text-xs text-ktip-sand-500 mb-1 ml-1">{ASSISTANT_NAME}</p>}

          <div
            className={`px-4 py-2.5 ${
              isOwn
                ? 'bg-ktip-ocean-500 dark:bg-ktip-ocean-200 text-white rounded-2xl rounded-br-md'
                : 'bg-ktip-cream border border-ktip-sand-200 text-ktip-sand-900 rounded-2xl rounded-bl-md'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>

            {steps.length > 0 && (
              <ol className="mt-3 space-y-1 list-decimal list-inside text-sm text-ktip-sand-700 border-t border-ktip-sand-200 pt-2">
                {steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}

            {destinations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {destinations.map((destination) => {
                  const Icon = resolveIcon(destination.icon)
                  return (
                    <button
                      key={destination.id}
                      type="button"
                      onClick={() => onNavigate(destination.href)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-ktip-ocean-50 text-ktip-ocean-700 border border-ktip-ocean-200 hover:bg-ktip-ocean-100 transition-colors"
                    >
                      <Icon size={13} className="shrink-0" />
                      {destination.title}
                      <ArrowUpRight size={12} className="shrink-0 opacity-60" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <p className={`text-xs text-ktip-sand-400 mt-1 ${isOwn ? 'text-right mr-1' : 'ml-1'}`}>
            {formatRelativeTime(message.timestamp.toISOString())}
          </p>
        </div>
      </div>
    </div>
  )
}
