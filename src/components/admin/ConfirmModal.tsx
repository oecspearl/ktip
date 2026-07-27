import { Show } from 'solid-js'
import { X, AlertTriangle } from 'lucide-solid'
import { Button } from '../ui/Button'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'primary' | 'danger'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal(props: ConfirmModalProps) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={props.onCancel}
        />

        {/* Dialog */}
        <div class="relative bg-white rounded-2xl shadow-hard max-w-md w-full p-6 animate-scale-in">
          <button
            type="button"
            onClick={props.onCancel}
            class="absolute top-4 right-4 p-1 text-ktip-sand-400 hover:text-ktip-sand-600 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>

          <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} class="text-yellow-600" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-lg font-semibold text-ktip-sand-900 font-display">
                {props.title}
              </h3>
              <p class="mt-2 text-sm text-ktip-sand-600">{props.message}</p>
            </div>
          </div>

          <div class="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={props.onCancel}
              disabled={props.loading}
            >
              Cancel
            </Button>
            <Button
              variant={props.confirmVariant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={props.onConfirm}
              loading={props.loading}
            >
              {props.confirmLabel || 'Confirm'}
            </Button>
          </div>
        </div>
      </div>
    </Show>
  )
}
