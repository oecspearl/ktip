import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link,
  ImageIcon,
  Table,
  Code2,
  Minus,
  Quote,
  Undo,
  Redo,
} from 'lucide-react'

interface EditorToolbarV2Props {
  editor: Editor | null
  onInsertLink: () => void
  onInsertImage: () => void
}

export function EditorToolbarV2({ editor, onInsertLink, onInsertImage }: EditorToolbarV2Props) {
  // Force a re-render on every editor transaction so active-state buttons stay live.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    if (!editor) return
    editor.on('transaction', forceUpdate)
    return () => {
      editor.off('transaction', forceUpdate)
    }
  }, [editor])

  if (!editor) return null

  const btn = (active: boolean, disabled = false) =>
    `p-1.5 rounded transition-colors ${
      disabled
        ? 'opacity-30 cursor-not-allowed'
        : active
          ? 'bg-white/15 text-white'
          : 'text-gray-400 hover:text-white hover:bg-white/10'
    }`

  const Sep = () => <div className="w-px h-5 bg-gray-600 mx-0.5" />

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-[#2c2c2e] border-b border-gray-700">
      {/* Text formatting */}
      <button
        type="button"
        className={btn(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
      >
        <Bold size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
      >
        <Italic size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive('underline'))}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline (Ctrl+U)"
      >
        <Underline size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive('strike'))}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <Strikethrough size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive('highlight'))}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        title="Highlight"
      >
        <Highlighter size={16} />
      </button>

      <Sep />

      {/* Headings */}
      <button
        type="button"
        className={btn(editor.isActive('heading', { level: 1 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Heading 1"
      >
        <Heading1 size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <Heading2 size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive('heading', { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        <Heading3 size={16} />
      </button>

      <Sep />

      {/* Lists */}
      <button
        type="button"
        className={btn(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        <List size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Ordered List"
      >
        <ListOrdered size={16} />
      </button>

      <Sep />

      {/* Alignment */}
      <button
        type="button"
        className={btn(editor.isActive({ textAlign: 'left' }))}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        title="Align Left"
      >
        <AlignLeft size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive({ textAlign: 'center' }))}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        title="Align Center"
      >
        <AlignCenter size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive({ textAlign: 'right' }))}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        title="Align Right"
      >
        <AlignRight size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive({ textAlign: 'justify' }))}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        title="Justify"
      >
        <AlignJustify size={16} />
      </button>

      <Sep />

      {/* Insert elements */}
      <button
        type="button"
        className={btn(editor.isActive('link'))}
        onClick={onInsertLink}
        title="Insert Link"
      >
        <Link size={16} />
      </button>
      <button
        type="button"
        className={btn(false)}
        onClick={onInsertImage}
        title="Insert Image"
      >
        <ImageIcon size={16} />
      </button>
      <button
        type="button"
        className={btn(false)}
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
        title="Insert Table"
      >
        <Table size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive('codeBlock'))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code Block"
      >
        <Code2 size={16} />
      </button>
      <button
        type="button"
        className={btn(false)}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        className={btn(editor.isActive('blockquote'))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Blockquote"
      >
        <Quote size={16} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Undo/Redo */}
      <button
        type="button"
        className={btn(false, !editor.can().undo())}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <Undo size={16} />
      </button>
      <button
        type="button"
        className={btn(false, !editor.can().redo())}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo size={16} />
      </button>
    </div>
  )
}
