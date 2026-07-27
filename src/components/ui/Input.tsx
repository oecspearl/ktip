import { type JSX, splitProps, Show, createUniqueId } from 'solid-js'
import { cn } from '../../lib/utils'

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: JSX.Element
  fullWidth?: boolean
}

export function Input(props: InputProps) {
  const [local, others] = splitProps(props, [
    'class',
    'label',
    'error',
    'helperText',
    'icon',
    'fullWidth',
  ])
  const inputId = others.id || createUniqueId()

  return (
    <div class={cn('flex flex-col gap-1.5', local.fullWidth && 'w-full')}>
      <Show when={local.label}>
        <label for={inputId} class="text-sm font-medium text-ktip-sand-700">{local.label}</label>
      </Show>

      <div class="relative">
        <Show when={local.icon}>
          <div class="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400">
            {local.icon}
          </div>
        </Show>

        <input
          id={inputId}
          class={cn(
            'w-full border rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all',
            'focus:outline-none focus:ring-2 focus:bg-white',
            local.icon && 'pl-10',
            local.error
              ? 'border-red-400/70 bg-red-50/30 focus:border-red-400 focus:ring-red-400/15'
              : 'border-ktip-sand-200 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20',
            local.class
          )}
          {...others}
        />
      </div>

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
