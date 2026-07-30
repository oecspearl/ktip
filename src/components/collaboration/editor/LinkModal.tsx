import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Modal } from '../../ui/Modal'

interface LinkModalProps {
  open: boolean
  onClose: () => void
  editor: Editor | null
}

export function LinkModal({ open, onClose, editor }: LinkModalProps) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')

  // Populate fields from the current selection whenever the modal opens.
  useEffect(() => {
    if (!open) return
    const ed = editor
    if (!ed) return
    const { from, to } = ed.state.selection
    const selectedText = ed.state.doc.textBetween(from, to, ' ')
    setText(selectedText)

    const existingLink = ed.getAttributes('link')
    if (existingLink.href) {
      setUrl(existingLink.href)
    } else {
      setUrl('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const ed = editor
    if (!ed) return

    const href = url.trim()
    if (!href) {
      ed.chain().focus().unsetLink().run()
    } else {
      const linkText = text.trim() || href
      const { from, to } = ed.state.selection

      if (from === to) {
        // No selection — insert text with link
        ed.chain()
          .focus()
          .insertContent(`<a href="${href}">${linkText}</a>`)
          .run()
      } else {
        // Has selection — set link on selection
        ed.chain().focus().setLink({ href }).run()
      }
    }

    setUrl('')
    setText('')
    onClose()
  }

  const handleRemove = () => {
    editor?.chain().focus().unsetLink().run()
    setUrl('')
    setText('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Insert Link" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
            Display Text <span className="text-ktip-sand-400">(optional)</span>
          </label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Link text"
            className="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
          />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            className="px-4 py-2 btn-brand text-sm font-medium rounded-lg"
          >
            Insert Link
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Remove Link
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-ktip-sand-600 hover:bg-ktip-sand-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
