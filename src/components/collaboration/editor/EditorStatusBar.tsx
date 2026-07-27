import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/core'

interface EditorStatusBarProps {
  editor: Editor | null
  saveStatus: 'saved' | 'saving' | 'unsaved'
  title?: string
}

export function EditorStatusBar({ editor, saveStatus, title }: EditorStatusBarProps) {
  // Force a re-render on every editor transaction so word/char counts stay live.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    if (!editor) return
    editor.on('transaction', forceUpdate)
    return () => {
      editor.off('transaction', forceUpdate)
    }
  }, [editor])

  const stats = (() => {
    if (!editor) return { words: 0, chars: 0 }
    const text = editor.state.doc.textContent
    const chars = text.length
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    return { words, chars }
  })()

  const statusLabel =
    saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Unsaved'

  const statusColor =
    saveStatus === 'saving' ? 'text-yellow-400' : saveStatus === 'saved' ? 'text-green-400' : 'text-gray-500'

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-[#1c1c1e] text-xs text-gray-500 select-none">
      <div className="flex items-center gap-4">
        <span>
          Words: <span className="text-gray-400">{stats.words.toLocaleString()}</span>
        </span>
        <span>
          Characters: <span className="text-gray-400">{stats.chars.toLocaleString()}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className={statusColor}>
          {saveStatus === 'saving' && (
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse mr-1.5 align-middle" />
          )}
          {saveStatus === 'saved' && (
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1.5 align-middle" />
          )}
          {statusLabel}
        </span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-500 truncate max-w-[200px]">{title || 'Document'}</span>
      </div>
    </div>
  )
}
