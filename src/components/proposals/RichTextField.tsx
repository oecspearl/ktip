import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
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
import { cn } from '../../lib/utils'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  ImagePlus,
  Table as TableIcon,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Unlink,
  Palette,
} from 'lucide-react'

interface RichTextFieldProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
  error?: boolean
}

const COLORS = [
  '#000000', '#374151', '#991b1b', '#b45309', '#166534',
  '#1e40af', '#6b21a8', '#be185d', '#0066cc', '#dc2626',
]

export function RichTextField({ value, onChange, placeholder, minHeight, error }: RichTextFieldProps) {
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const skipUpdateRef = useRef(false)

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
        placeholder: placeholder || 'Start writing...',
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'prose-editor-proposal',
      },
    },
    onUpdate: ({ editor: e }) => {
      if (!skipUpdateRef.current) {
        onChange(e.getHTML())
      }
    },
    // Re-render on every transaction so toolbar active states stay in sync
    shouldRerenderOnTransaction: true,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (e.g. AI replacing content)
  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) {
      skipUpdateRef.current = true
      editor.commands.setContent(value || '')
      skipUpdateRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  const insertLink = () => {
    const url = linkUrl.trim()
    if (!editor || !url) return
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    setLinkUrl('')
    setShowLinkInput(false)
  }

  const removeLink = () => {
    if (!editor) return
    editor.chain().focus().unsetLink().run()
  }

  const insertImage = () => {
    const url = imageUrl.trim()
    if (!editor || !url) return
    editor.chain().focus().setImage({ src: url }).run()
    setImageUrl('')
    setShowImageInput(false)
  }

  const insertTable = () => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  const setColor = (color: string) => {
    if (!editor) return
    editor.chain().focus().setColor(color).run()
    setShowColorPicker(false)
  }

  const btn = (active: boolean) =>
    cn(
      'p-1.5 transition-colors',
      active ? 'bg-ktip-ocean-600 text-white' : 'text-ktip-sand-600 hover:bg-ktip-sand-100'
    )

  const iconBtn = 'p-1.5 text-ktip-sand-600 hover:bg-ktip-sand-100 transition-colors'
  const divider = 'w-px h-5 bg-ktip-sand-200 mx-0.5'

  return (
    <div
      className={cn(
        'border overflow-hidden transition-colors',
        error
          ? 'border-red-300'
          : 'border-ktip-sand-300 focus-within:border-ktip-ocean-600 focus-within:ring-1 focus-within:ring-ktip-ocean-600'
      )}
    >
      {editor && (
        <div className="border-b border-ktip-sand-200 bg-ktip-sand-50">
          {/* Row 1: Text formatting + headings */}
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-ktip-sand-100">
            <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
              <Bold size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
              <Italic size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
              <UnderlineIcon size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
              <Strikethrough size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('highlight'))} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight">
              <Highlighter size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('code'))} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline Code">
              <Code size={15} />
            </button>

            <div className={divider} />

            {/* Color picker */}
            <div className="relative">
              <button type="button" className={iconBtn} onClick={() => setShowColorPicker(!showColorPicker)} title="Text Color">
                <Palette size={15} />
              </button>
              {showColorPicker && (
                <div className="absolute top-full left-0 z-10 mt-1 bg-white border border-ktip-sand-200 shadow-md p-2 flex gap-1 flex-wrap w-32">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-5 h-5 border border-ktip-sand-200 hover:scale-110 transition-transform"
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className={divider} />

            <button type="button" className={btn(editor.isActive('subscript'))} onClick={() => editor.chain().focus().toggleSubscript().run()} title="Subscript">
              <SubIcon size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('superscript'))} onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Superscript">
              <SupIcon size={15} />
            </button>

            <div className="flex-1" />

            {/* Undo / Redo */}
            <button type="button" className={cn(iconBtn, 'disabled:opacity-40')} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
              <Undo size={15} />
            </button>
            <button type="button" className={cn(iconBtn, 'disabled:opacity-40')} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
              <Redo size={15} />
            </button>
          </div>

          {/* Row 2: Headings, lists, alignment, inserts */}
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
            <button type="button" className={btn(editor.isActive('heading', { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
              <Heading1 size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
              <Heading2 size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
              <Heading3 size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('heading', { level: 4 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} title="Heading 4">
              <Heading4 size={15} />
            </button>

            <div className={divider} />

            <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">
              <List size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered List">
              <ListOrdered size={15} />
            </button>
            <button type="button" className={btn(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
              <Quote size={15} />
            </button>
            <button type="button" className={iconBtn} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
              <Minus size={15} />
            </button>

            <div className={divider} />

            {/* Text alignment */}
            <button type="button" className={btn(editor.isActive({ textAlign: 'left' }))} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align Left">
              <AlignLeft size={15} />
            </button>
            <button type="button" className={btn(editor.isActive({ textAlign: 'center' }))} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align Center">
              <AlignCenter size={15} />
            </button>
            <button type="button" className={btn(editor.isActive({ textAlign: 'right' }))} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align Right">
              <AlignRight size={15} />
            </button>
            <button type="button" className={btn(editor.isActive({ textAlign: 'justify' }))} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify">
              <AlignJustify size={15} />
            </button>

            <div className={divider} />

            {/* Insert: Link */}
            <div className="relative">
              {editor.isActive('link') ? (
                <button type="button" className={iconBtn} onClick={removeLink} title="Remove Link">
                  <Unlink size={15} />
                </button>
              ) : (
                <button type="button" className={iconBtn} onClick={() => setShowLinkInput(!showLinkInput)} title="Insert Link">
                  <LinkIcon size={15} />
                </button>
              )}
              {showLinkInput && (
                <div className="absolute top-full left-0 z-10 mt-1 bg-white border border-ktip-sand-200 shadow-md p-2 flex gap-1 w-64">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && insertLink()}
                    placeholder="https://..."
                    className="flex-1 px-2 py-1 border border-ktip-sand-300 text-sm focus:outline-none focus:border-ktip-ocean-600"
                  />
                  <button type="button" className="px-2 py-1 bg-ktip-ocean-600 text-white text-sm" onClick={insertLink}>Add</button>
                </div>
              )}
            </div>

            {/* Insert: Image */}
            <div className="relative">
              <button type="button" className={iconBtn} onClick={() => setShowImageInput(!showImageInput)} title="Insert Image">
                <ImagePlus size={15} />
              </button>
              {showImageInput && (
                <div className="absolute top-full left-0 z-10 mt-1 bg-white border border-ktip-sand-200 shadow-md p-2 flex gap-1 w-64">
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && insertImage()}
                    placeholder="Image URL..."
                    className="flex-1 px-2 py-1 border border-ktip-sand-300 text-sm focus:outline-none focus:border-ktip-ocean-600"
                  />
                  <button type="button" className="px-2 py-1 bg-ktip-ocean-600 text-white text-sm" onClick={insertImage}>Add</button>
                </div>
              )}
            </div>

            {/* Insert: Table */}
            <button type="button" className={iconBtn} onClick={insertTable} title="Insert Table (3x3)">
              <TableIcon size={15} />
            </button>
          </div>
        </div>
      )}

      <EditorContent editor={editor} style={{ minHeight: minHeight || '200px' }} />
    </div>
  )
}
