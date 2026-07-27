import { Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { X } from 'lucide-solid'

interface UATReminderPopupProps {
  open: boolean
  onDismiss: () => void
  onOpen: () => void
}

export function UATReminderPopup(props: UATReminderPopupProps) {
  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed bottom-24 right-6 z-50 animate-slide-up">
          <div class="bg-white rounded-2xl shadow-hard border border-ktip-ocean-100 p-5 max-w-xs">
            {/* Close button */}
            <button
              onClick={props.onDismiss}
              class="absolute top-3 right-3 p-1 rounded-lg hover:bg-ktip-sand-100 transition-colors"
              aria-label="Dismiss reminder"
            >
              <X size={16} class="text-ktip-sand-400" />
            </button>

            {/* Content */}
            <div class="flex items-start gap-3">
              <img
                src="/pwa-512x512.png"
                alt="KTIP Logo"
                class="w-10 h-10 rounded-full object-cover shrink-0"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-ktip-sand-900">
                  Your opinion matters!
                </p>
                <p class="text-xs text-ktip-sand-600 mt-1">
                  Help us improve KTIP by sharing your experience with the platform. It only takes a few minutes.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div class="flex gap-2 mt-4">
              <button
                onClick={props.onOpen}
                class="flex-1 px-4 py-2 bg-gradient-to-r from-ktip-ocean-500 to-ktip-ocean-600 text-white text-sm font-medium rounded-xl hover:shadow-md transition-all"
              >
                Give Feedback
              </button>
              <button
                onClick={props.onDismiss}
                class="px-4 py-2 text-sm font-medium text-ktip-sand-500 hover:text-ktip-sand-700 rounded-xl hover:bg-ktip-sand-50 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}
