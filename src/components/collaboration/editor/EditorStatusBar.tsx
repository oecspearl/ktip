import { createMemo, Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Editor } from '@tiptap/core'

interface EditorStatusBarProps {
  editor: () => Editor | undefined
  saveStatus: Accessor<'saved' | 'saving' | 'unsaved'>
  title?: () => string
}

export function EditorStatusBar(props: EditorStatusBarProps) {
  const stats = createMemo(() => {
    const ed = props.editor()
    if (!ed) return { words: 0, chars: 0 }

    const text = ed.state.doc.textContent
    const chars = text.length
    const words = text.trim() ? text.trim().split(/\s+/).length : 0

    return { words, chars }
  })

  const statusLabel = () => {
    switch (props.saveStatus()) {
      case 'saving': return 'Saving...'
      case 'saved': return 'Saved'
      case 'unsaved': return 'Unsaved'
    }
  }

  const statusColor = () => {
    switch (props.saveStatus()) {
      case 'saving': return 'text-yellow-400'
      case 'saved': return 'text-green-400'
      case 'unsaved': return 'text-gray-500'
    }
  }

  return (
    <div class="flex items-center justify-between px-3 py-1.5 bg-[#1c1c1e] text-xs text-gray-500 select-none">
      <div class="flex items-center gap-4">
        <span>
          Words: <span class="text-gray-400">{stats().words.toLocaleString()}</span>
        </span>
        <span>
          Characters: <span class="text-gray-400">{stats().chars.toLocaleString()}</span>
        </span>
      </div>
      <div class="flex items-center gap-3">
        <span class={statusColor()}>
          <Show when={props.saveStatus() === 'saving'}>
            <span class="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse mr-1.5 align-middle" />
          </Show>
          <Show when={props.saveStatus() === 'saved'}>
            <span class="inline-block w-2 h-2 rounded-full bg-green-400 mr-1.5 align-middle" />
          </Show>
          {statusLabel()}
        </span>
        <span class="text-gray-600">|</span>
        <span class="text-gray-500 truncate max-w-[200px]">{props.title?.() || 'Document'}</span>
      </div>
    </div>
  )
}
