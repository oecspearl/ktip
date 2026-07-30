import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface UATReminderPopupProps {
  open: boolean
  onDismiss: () => void
  onOpen: () => void
}

export function UATReminderPopup({ open, onDismiss, onOpen }: UATReminderPopupProps) {
  if (!open) return null

  return createPortal(
    <div className="fixed bottom-24 right-6 z-50 animate-slide-up">
      <div className="bg-ktip-cream rounded-2xl shadow-hard border border-ktip-ocean-100 p-5 max-w-xs">
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg hover:bg-ktip-sand-100 transition-colors"
          aria-label="Dismiss reminder"
        >
          <X size={16} className="text-ktip-sand-400" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3">
          <img
            src="/pwa-512x512.png"
            alt="KTIP Logo"
            loading="lazy" decoding="async" width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ktip-sand-900">
              Your opinion matters!
            </p>
            <p className="text-xs text-ktip-sand-600 mt-1">
              Help us improve KTIP by sharing your experience with the platform. It only takes a few minutes.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onOpen}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-ktip-ocean-500 to-ktip-ocean-600 text-white text-sm font-medium rounded-xl hover:shadow-md transition-all"
          >
            Give Feedback
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm font-medium text-ktip-sand-500 hover:text-ktip-sand-700 rounded-xl hover:bg-ktip-sand-50 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
