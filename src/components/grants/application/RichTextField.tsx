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
import { cn } from '../../../lib/utils'
import {
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
  ToolbarSpacer,
} from '../../ui/Toolbar'
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
import { useLingui } from '@lingui/react/macro'

interface RichTextFieldProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
  error?: boolean
  /** false renders the content read-only and hides the toolbar */
  editable?: boolean
}

const COLORS = [
  '#000000', '#374151', '#991b1b', '#b45309', '#166534',
  '#1e40af', '#6b21a8', '#be185d', '#041E42', '#dc2626',
]

export function RichTextField({ value, onChange, placeholder, minHeight, error, editable = true }: RichTextFieldProps) {
    const { t } = useLingui()
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

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
  }, [editable, editor])

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

  return (
    <div
      className={cn(
        'border overflow-hidden transition-colors',
        error
          ? 'border-red-300'
          : 'border-ktip-sand-300 focus-within:border-ktip-ocean-600 focus-within:ring-1 focus-within:ring-ktip-ocean-600'
      )}
    >
      {/* Same Toolbar primitives as the collaboration tools — this field keeps
          its two-row layout and inline popovers, but not its own button styles. */}
      {editor && editable && (
        <div className="border-b border-ktip-sand-200">
          {/* Row 1: Text formatting */}
          <Toolbar seamless className="border-b border-ktip-sand-100">
            <ToolbarButton icon={<Bold size={15} />} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title={t`Bold (Ctrl+B)`} aria-label={t`Bold`} />
            <ToolbarButton icon={<Italic size={15} />} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title={t`Italic (Ctrl+I)`} aria-label={t`Italic`} />
            <ToolbarButton icon={<UnderlineIcon size={15} />} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title={t`Underline (Ctrl+U)`} aria-label={t`Underline`} />
            <ToolbarButton icon={<Strikethrough size={15} />} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title={t`Strikethrough`} aria-label={t`Strikethrough`} />
            <ToolbarButton icon={<Highlighter size={15} />} active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title={t`Highlight`} aria-label={t`Highlight`} />
            <ToolbarButton icon={<Code size={15} />} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title={t`Inline Code`} aria-label={t`Inline code`} />

            <ToolbarSeparator />

            {/* Color picker */}
            <div className="relative">
              <ToolbarButton icon={<Palette size={15} />} active={showColorPicker} onClick={() => setShowColorPicker(!showColorPicker)} title={t`Text Color`} aria-label={t`Text colour`} />
              {showColorPicker && (
                <div className="absolute top-full left-0 z-10 mt-1 bg-ktip-cream border border-ktip-sand-200 shadow-medium rounded-lg p-2 flex gap-1 flex-wrap w-32">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-5 h-5 rounded border border-ktip-sand-200 hover:scale-110 transition-transform"
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                      aria-label={t`Set colour ${c}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <ToolbarSeparator />

            <ToolbarButton icon={<SubIcon size={15} />} active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} title={t`Subscript`} aria-label={t`Subscript`} />
            <ToolbarButton icon={<SupIcon size={15} />} active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} title={t`Superscript`} aria-label={t`Superscript`} />

            <ToolbarSpacer />

            <ToolbarButton icon={<Undo size={15} />} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title={t`Undo`} aria-label={t`Undo`} />
            <ToolbarButton icon={<Redo size={15} />} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title={t`Redo`} aria-label={t`Redo`} />
          </Toolbar>

          {/* Row 2: Headings, lists, alignment, inserts */}
          <Toolbar seamless>
            <ToolbarButton icon={<Heading1 size={15} />} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title={t`Heading 1`} aria-label={t`Heading 1`} />
            <ToolbarButton icon={<Heading2 size={15} />} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title={t`Heading 2`} aria-label={t`Heading 2`} />
            <ToolbarButton icon={<Heading3 size={15} />} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title={t`Heading 3`} aria-label={t`Heading 3`} />
            <ToolbarButton icon={<Heading4 size={15} />} active={editor.isActive('heading', { level: 4 })} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} title={t`Heading 4`} aria-label={t`Heading 4`} />

            <ToolbarSeparator />

            <ToolbarButton icon={<List size={15} />} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title={t`Bullet List`} aria-label={t`Bullet list`} />
            <ToolbarButton icon={<ListOrdered size={15} />} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title={t`Numbered List`} aria-label={t`Numbered list`} />
            <ToolbarButton icon={<Quote size={15} />} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title={t`Blockquote`} aria-label={t`Blockquote`} />
            <ToolbarButton icon={<Minus size={15} />} onClick={() => editor.chain().focus().setHorizontalRule().run()} title={t`Horizontal Rule`} aria-label={t`Horizontal rule`} />

            <ToolbarSeparator />

            <ToolbarButton icon={<AlignLeft size={15} />} active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title={t`Align Left`} aria-label={t`Align left`} />
            <ToolbarButton icon={<AlignCenter size={15} />} active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title={t`Align Center`} aria-label={t`Align center`} />
            <ToolbarButton icon={<AlignRight size={15} />} active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title={t`Align Right`} aria-label={t`Align right`} />
            <ToolbarButton icon={<AlignJustify size={15} />} active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title={t`Justify`} aria-label={t`Justify`} />

            <ToolbarSeparator />

            {/* Insert: Link */}
            <div className="relative">
              {editor.isActive('link') ? (
                <ToolbarButton icon={<Unlink size={15} />} onClick={removeLink} title={t`Remove Link`} aria-label={t`Remove link`} />
              ) : (
                <ToolbarButton icon={<LinkIcon size={15} />} active={showLinkInput} onClick={() => setShowLinkInput(!showLinkInput)} title={t`Insert Link`} aria-label={t`Insert link`} />
              )}
              {showLinkInput && (
                <div className="absolute top-full left-0 z-10 mt-1 bg-ktip-cream border border-ktip-sand-200 shadow-medium rounded-lg p-2 flex gap-1 w-64">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && insertLink()}
                    placeholder="https://..."
                    className="flex-1 px-2 py-1 rounded border border-ktip-sand-300 bg-ktip-cream text-sm focus:outline-none focus:border-ktip-ocean-600"
                  />
                  <button type="button" className="px-2 py-1 rounded bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white text-sm" onClick={insertLink}>Add</button>
                </div>
              )}
            </div>

            {/* Insert: Image */}
            <div className="relative">
              <ToolbarButton icon={<ImagePlus size={15} />} active={showImageInput} onClick={() => setShowImageInput(!showImageInput)} title={t`Insert Image`} aria-label={t`Insert image`} />
              {showImageInput && (
                <div className="absolute top-full left-0 z-10 mt-1 bg-ktip-cream border border-ktip-sand-200 shadow-medium rounded-lg p-2 flex gap-1 w-64">
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && insertImage()}
                    placeholder={t`Image URL...`}
                    className="flex-1 px-2 py-1 rounded border border-ktip-sand-300 bg-ktip-cream text-sm focus:outline-none focus:border-ktip-ocean-600"
                  />
                  <button type="button" className="px-2 py-1 rounded bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white text-sm" onClick={insertImage}>Add</button>
                </div>
              )}
            </div>

            <ToolbarButton icon={<TableIcon size={15} />} onClick={insertTable} title={t`Insert Table (3x3)`} aria-label={t`Insert table`} />
          </Toolbar>
        </div>
      )}

      <EditorContent editor={editor} style={{ minHeight: minHeight || '200px' }} />
    </div>
  )
}
