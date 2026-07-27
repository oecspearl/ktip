import { createSignal } from 'solid-js'
import type { Editor } from '@tiptap/core'
import { Modal } from '../../ui/Modal'

interface LinkModalProps {
  open: boolean
  onClose: () => void
  editor: () => Editor | undefined
}

export function LinkModal(props: LinkModalProps) {
  const [url, setUrl] = createSignal('')
  const [text, setText] = createSignal('')

  const handleOpen = () => {
    const ed = props.editor()
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
  }

  // Run on open
  if (props.open) handleOpen()

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    const ed = props.editor()
    if (!ed) return

    const href = url().trim()
    if (!href) {
      ed.chain().focus().unsetLink().run()
    } else {
      const linkText = text().trim() || href
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
    props.onClose()
  }

  const handleRemove = () => {
    props.editor()?.chain().focus().unsetLink().run()
    setUrl('')
    setText('')
    props.onClose()
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="Insert Link" size="sm">
      <form onSubmit={handleSubmit} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">URL</label>
          <input
            type="url"
            value={url()}
            onInput={(e) => setUrl(e.currentTarget.value)}
            placeholder="https://example.com"
            class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
            Display Text <span class="text-ktip-sand-400">(optional)</span>
          </label>
          <input
            type="text"
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            placeholder="Link text"
            class="w-full px-3 py-2 border border-ktip-sand-200 rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
          />
        </div>
        <div class="flex items-center gap-2 pt-2">
          <button
            type="submit"
            class="px-4 py-2 bg-ktip-ocean-600 hover:bg-ktip-ocean-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Insert Link
          </button>
          <button
            type="button"
            onClick={handleRemove}
            class="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Remove Link
          </button>
          <button
            type="button"
            onClick={props.onClose}
            class="px-4 py-2 text-sm text-ktip-sand-600 hover:bg-ktip-sand-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
