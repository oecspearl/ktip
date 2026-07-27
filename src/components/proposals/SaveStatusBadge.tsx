import { Show } from 'solid-js'
import { Loader2, Check, CircleAlert } from 'lucide-solid'
import type { SaveStatus } from '../../hooks/useAutoSave'

interface SaveStatusBadgeProps {
  status: SaveStatus
}

export function SaveStatusBadge(props: SaveStatusBadgeProps) {
  return (
    <Show when={props.status !== 'idle'}>
      <span class="inline-flex items-center gap-1 ml-3 text-xs">
        <Show when={props.status === 'saving'}>
          <Loader2 size={12} class="animate-spin text-ktip-sand-400" />
          <span class="text-ktip-sand-400">Saving...</span>
        </Show>
        <Show when={props.status === 'saved'}>
          <Check size={12} class="text-ktip-tropical-500" />
          <span class="text-ktip-tropical-600">Saved</span>
        </Show>
        <Show when={props.status === 'error'}>
          <CircleAlert size={12} class="text-red-400" />
          <span class="text-red-500">Save failed</span>
        </Show>
      </span>
    </Show>
  )
}
