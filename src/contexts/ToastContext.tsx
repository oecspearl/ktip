import { createContext, useContext, useState, useCallback, useMemo, type PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
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

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

let nextId = 0

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const styleMap = {
  success: 'bg-ktip-tropical-50 border-ktip-tropical-200 text-ktip-tropical-900',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-ktip-sun-50 border-ktip-sun-200 text-ktip-sun-800',
  info: 'bg-ktip-ocean-50 border-ktip-ocean-200 text-ktip-ocean-800',
}

// Brand green and yellow at 500 are ~1.7:1 on their own light chips, so the
// light side uses the 700 shades and the vivid brand tone is kept for dark,
// where the chip background is a near-black tint.
const iconColorMap = {
  success: 'text-ktip-tropical-700 dark:text-ktip-tropical-500',
  error: 'text-red-500',
  warning: 'text-ktip-sun-700 dark:text-ktip-sun-500',
  info: 'text-ktip-ocean-500',
}

export const ToastProvider = ({ children }: PropsWithChildren) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (type: ToastType, message: string, duration = 4000) => {
      const id = nextId++
      setToasts((prev) => [...prev, { id, type, message, duration }])
      setTimeout(() => removeToast(id), duration)
    },
    [removeToast]
  )

  // Stable across toast show/dismiss renders, so consumers holding `toast` in
  // dependency arrays don't re-run whenever any toast appears or expires.
  const value: ToastContextValue = useMemo(
    () => ({
      toast: {
        success: (msg, dur) => addToast('success', msg, dur),
        error: (msg, dur) => addToast('error', msg, dur),
        warning: (msg, dur) => addToast('warning', msg, dur),
        info: (msg, dur) => addToast('info', msg, dur),
      },
    }),
    [addToast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          // Hidden while a screenshot frame is grabbed (index.css,
          // data-capturing) — a toast is app chrome, not part of the bug
          data-capture-hide
          className="fixed bottom-4 right-4 z-toast flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        >
          {toasts.map((toast) => {
            const Icon = iconMap[toast.type]
            return (
              <div
                key={toast.id}
                className={cn(
                  'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-medium animate-slide-up',
                  styleMap[toast.type]
                )}
              >
                <Icon size={20} className={cn('shrink-0 mt-0.5', iconColorMap[toast.type])} />
                <p className="text-sm font-medium flex-1">{toast.message}</p>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <X size={16} />
                </button>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context.toast
}
