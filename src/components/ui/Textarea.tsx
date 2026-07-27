import { type JSX, splitProps, Show, createUniqueId } from 'solid-js'
import { cn } from '../../lib/utils'

interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  fullWidth?: boolean
}

export function Textarea(props: TextareaProps) {
  const [local, others] = splitProps(props, [
    'class',
    'label',
    'error',
    'helperText',
    'fullWidth',
  ])
  const textareaId = others.id || createUniqueId()

  return (
    <div class={cn('flex flex-col gap-1.5', local.fullWidth && 'w-full')}>
      <Show when={local.label}>
        <label for={textareaId} class="text-sm font-medium text-ktip-sand-700">{local.label}</label>
      </Show>

      <textarea
        id={textareaId}
        class={cn(
          'w-full border rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all resize-none',
          'focus:outline-none focus:ring-2 focus:bg-white',
          local.error
            ? 'border-red-400/70 bg-red-50/30 focus:border-red-400 focus:ring-red-400/15'
            : 'border-ktip-sand-200 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20',
          local.class
        )}
        {...others}
      />

      <Show when={local.error || local.helperText}>
        <p
          class={cn(
            'text-sm',
            local.error ? 'text-red-500' : 'text-ktip-sand-500'
          )}
        >
          {local.error || local.helperText}
        </p>
      </Show>
    </div>
  )
}
