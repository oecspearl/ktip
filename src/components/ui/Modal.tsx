import { type JSX, Show, splitProps, createEffect, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import { X } from 'lucide-solid'
import { cn } from '../../lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: JSX.Element
  size?: 'sm' | 'md' | 'lg' | 'xl'
  class?: string
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal(props: ModalProps) {
  const [local, others] = splitProps(props, [
    'open',
    'onClose',
    'title',
    'description',
    'children',
    'size',
    'class',
  ])

  let dialogRef: HTMLDivElement | undefined
  let previousFocus: HTMLElement | null = null

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      local.onClose()
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      local.onClose()
      return
    }
    if (e.key !== 'Tab' || !dialogRef) return

    const focusable = Array.from(dialogRef.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Focus management: save previous focus, restore on close
  createEffect(() => {
    if (local.open) {
      previousFocus = document.activeElement as HTMLElement
      // Focus the first focusable element after render
      requestAnimationFrame(() => {
        if (dialogRef) {
          const first = dialogRef.querySelector<HTMLElement>(FOCUSABLE)
          first?.focus()
        }
      })
    } else if (previousFocus) {
      previousFocus.focus()
      previousFocus = null
    }
  })

  // Prevent body scroll when modal is open
  createEffect(() => {
    if (local.open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    onCleanup(() => {
      document.body.style.overflow = ''
    })
  })

  return (
    <Show when={local.open}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={handleBackdropClick}
          onKeyDown={handleKeyDown}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={local.title}
            class={cn(
              'relative bg-white rounded-3xl shadow-hard w-full mx-4 animate-scale-in max-h-[90vh] overflow-y-auto',
              sizeStyles[local.size || 'md'],
              local.class
            )}
            {...others}
          >
            {/* Header */}
            <div class="flex items-start justify-between p-6 border-b border-ktip-sand-100">
              <div class="flex-1">
                <Show when={local.title}>
                  <h2 class="text-2xl font-display font-bold text-ktip-sand-900">
                    {local.title}
                  </h2>
                </Show>
                <Show when={local.description}>
                  <p class="mt-1 text-sm text-ktip-sand-600">{local.description}</p>
                </Show>
              </div>
              <button
                onClick={local.onClose}
                class="ml-4 p-1 rounded-lg hover:bg-ktip-sand-100 transition-colors"
                aria-label="Close modal"
              >
                <X size={24} class="text-ktip-sand-400" />
              </button>
            </div>

            {/* Content */}
            <div class="p-6">{local.children}</div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}
