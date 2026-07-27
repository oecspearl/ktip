import { createSignal } from 'solid-js'
import type { Editor } from '@tiptap/core'
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
import { createTiptapEditor } from 'solid-tiptap'

interface TiptapEditorProps {
  onEditorReady?: (editor: Editor) => void
  placeholder?: string
  initialContent?: string
}

export function TiptapEditor(props: TiptapEditorProps) {
  const [ref, setRef] = createSignal<HTMLDivElement>()

  const editor = createTiptapEditor(() => {
    const el = ref()
    if (!el) return undefined as unknown as { element: HTMLDivElement; extensions: [] }
    return {
      element: el,
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
          placeholder: props.placeholder || 'Start writing your document...',
        }),
      ],
      content: props.initialContent || '',
      editorProps: {
        attributes: {
          class: 'prose-editor',
        },
      },
      onCreate: ({ editor: e }) => {
        props.onEditorReady?.(e)
      },
    }
  })

  return {
    editor,
    ref: setRef,
  }
}
