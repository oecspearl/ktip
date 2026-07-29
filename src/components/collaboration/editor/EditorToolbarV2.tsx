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
import {
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
  ToolbarSpacer,
} from '../../ui/Toolbar'

interface EditorToolbarV2Props {
  editor: Editor | null
  onInsertLink: () => void
  onInsertImage: () => void
}

/**
 * Formatting toolbar for the document editor. Active-state tracking relies on
 * TiptapEditor's `shouldRerenderOnTransaction`, so no manual force-update here.
 */
export function EditorToolbarV2({ editor, onInsertLink, onInsertImage }: EditorToolbarV2Props) {
  if (!editor) return null

  return (
    <Toolbar>
      {/* Text formatting */}
      <ToolbarButton
        icon={<Bold size={16} />}
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
        aria-label="Bold"
      />
      <ToolbarButton
        icon={<Italic size={16} />}
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
        aria-label="Italic"
      />
      <ToolbarButton
        icon={<Underline size={16} />}
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline (Ctrl+U)"
        aria-label="Underline"
      />
      <ToolbarButton
        icon={<Strikethrough size={16} />}
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
        aria-label="Strikethrough"
      />
      <ToolbarButton
        icon={<Highlighter size={16} />}
        active={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        title="Highlight"
        aria-label="Highlight"
      />

      <ToolbarSeparator />

      {/* Headings */}
      <ToolbarButton
        icon={<Heading1 size={16} />}
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Heading 1"
        aria-label="Heading 1"
      />
      <ToolbarButton
        icon={<Heading2 size={16} />}
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
        aria-label="Heading 2"
      />
      <ToolbarButton
        icon={<Heading3 size={16} />}
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
        aria-label="Heading 3"
      />

      <ToolbarSeparator />

      {/* Lists */}
      <ToolbarButton
        icon={<List size={16} />}
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
        aria-label="Bullet list"
      />
      <ToolbarButton
        icon={<ListOrdered size={16} />}
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Ordered List"
        aria-label="Ordered list"
      />

      <ToolbarSeparator />

      {/* Alignment */}
      <ToolbarButton
        icon={<AlignLeft size={16} />}
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        title="Align Left"
        aria-label="Align left"
      />
      <ToolbarButton
        icon={<AlignCenter size={16} />}
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        title="Align Center"
        aria-label="Align center"
      />
      <ToolbarButton
        icon={<AlignRight size={16} />}
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        title="Align Right"
        aria-label="Align right"
      />
      <ToolbarButton
        icon={<AlignJustify size={16} />}
        active={editor.isActive({ textAlign: 'justify' })}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        title="Justify"
        aria-label="Justify"
      />

      <ToolbarSeparator />

      {/* Insert elements */}
      <ToolbarButton
        icon={<Link size={16} />}
        active={editor.isActive('link')}
        onClick={onInsertLink}
        title="Insert Link"
        aria-label="Insert link"
      />
      <ToolbarButton
        icon={<ImageIcon size={16} />}
        onClick={onInsertImage}
        title="Insert Image"
        aria-label="Insert image"
      />
      <ToolbarButton
        icon={<Table size={16} />}
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        title="Insert Table"
        aria-label="Insert table"
      />
      <ToolbarButton
        icon={<Code2 size={16} />}
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code Block"
        aria-label="Code block"
      />
      <ToolbarButton
        icon={<Minus size={16} />}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
        aria-label="Horizontal rule"
      />
      <ToolbarButton
        icon={<Quote size={16} />}
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Blockquote"
        aria-label="Blockquote"
      />

      <ToolbarSpacer />

      {/* Undo/Redo */}
      <ToolbarButton
        icon={<Undo size={16} />}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      />
      <ToolbarButton
        icon={<Redo size={16} />}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      />
    </Toolbar>
  )
}
