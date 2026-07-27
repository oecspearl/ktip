import { createContext, useContext, createSignal, For, type ParentComponent } from 'solid-js'
import { Portal } from 'solid-js/web'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-solid'
import { cn } from '../lib/utils'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
  duration: number
}

interface ToastContextValue {
  toast: {
    success: (message: string, duration?: number) => void
    error: (message: string, duration?: number) => void
    warning: (message: string, duration?: number) => void
    info: (message: string, duration?: number) => void
  }
}

const ToastContext = createContext<ToastContextValue>()

let nextId = 0

export const ToastProvider: ParentComponent = (props) => {
  const [toasts, setToasts] = createSignal<Toast[]>([])

  const addToast = (type: ToastType, message: string, duration = 4000) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, type, message, duration }])
    setTimeout(() => removeToast(id), duration)
  }

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const value: ToastContextValue = {
    toast: {
      success: (msg, dur) => addToast('success', msg, dur),
      error: (msg, dur) => addToast('error', msg, dur),
      warning: (msg, dur) => addToast('warning', msg, dur),
      info: (msg, dur) => addToast('info', msg, dur),
    },
  }

  const iconMap = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  }

  const styleMap = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }

  const iconColorMap = {
    success: 'text-emerald-500',
    error: 'text-red-500',
    warning: 'text-amber-500',
    info: 'text-blue-500',
  }

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      <Portal>
        <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          <For each={toasts()}>
            {(toast) => {
              const Icon = iconMap[toast.type]
              return (
                <div
                  class={cn(
                    'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-medium animate-slide-up',
                    styleMap[toast.type]
                  )}
                >
                  <Icon size={20} class={cn('shrink-0 mt-0.5', iconColorMap[toast.type])} />
                  <p class="text-sm font-medium flex-1">{toast.message}</p>
                  <button
                    onClick={() => removeToast(toast.id)}
                    class="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <X size={16} />
                  </button>
                </div>
              )
            }}
          </For>
        </div>
      </Portal>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context.toast
}
