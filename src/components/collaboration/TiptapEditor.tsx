import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import { useToast } from '../../contexts/ToastContext'
import { uploadDocumentImage } from '../../lib/storage-upload'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Placeholder from '@tiptap/extension-placeholder'

interface TiptapEditorProps {
  onEditorReady?: (editor: Editor) => void
  placeholder?: string
  initialContent?: string
}

function imageFilesFrom(transfer: DataTransfer | null): File[] {
  return Array.from(transfer?.files ?? []).filter((file) => file.type.startsWith('image/'))
}

export function TiptapEditor({ onEditorReady, placeholder, initialContent }: TiptapEditorProps) {
  const toast = useToast()

  /**
   * Upload dropped/pasted images to storage and insert them by URL.
   *
   * Without this, TipTap's default handler inlines the image as a base64 data
   * URI in the document HTML — it never reaches storage and bloats the row.
   */
  const uploadAndInsert = (view: EditorView, files: File[], at: number) => {
    let pos = at
    void (async () => {
      for (const file of files) {
        try {
          const url = await uploadDocumentImage(file)
          const node = view.state.schema.nodes.image.create({ src: url })
          const insertAt = Math.min(pos, view.state.doc.content.size)
          view.dispatch(view.state.tr.insert(insertAt, node))
          pos = insertAt + node.nodeSize
        } catch (err: any) {
          toast.error(err?.message || 'Failed to upload image')
        }
      }
    })()
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color,
      Subscript,
      Superscript,
      Placeholder.configure({
        placeholder: placeholder || 'Start writing your document...',
      }),
    ],
    content: initialContent || '',
    // Keeps EditorToolbarV2's active states live without a manual force-update.
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'prose-editor',
      },
      handleDrop: (view, event, _slice, moved) => {
        // `moved` means the user is dragging a node within the document.
        if (moved) return false
        const files = imageFilesFrom((event as DragEvent).dataTransfer)
        if (files.length === 0) return false

        event.preventDefault()
        const coords = { left: (event as DragEvent).clientX, top: (event as DragEvent).clientY }
        const at = view.posAtCoords(coords)?.pos ?? view.state.selection.from
        uploadAndInsert(view, files, at)
        return true
      },
      handlePaste: (view, event) => {
        const files = imageFilesFrom((event as ClipboardEvent).clipboardData)
        if (files.length === 0) return false

        event.preventDefault()
        uploadAndInsert(view, files, view.state.selection.from)
        return true
      },
    },
  })

  // Hand the editor instance up to the parent once it's created.
  useEffect(() => {
    if (editor) onEditorReady?.(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return <EditorContent editor={editor} />
}
