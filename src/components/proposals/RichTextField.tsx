import { createSignal, createEffect, on, Show } from 'solid-js'
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
} from 'lucide-solid'

interface RichTextFieldProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
  error?: boolean
}

export function RichTextField(props: RichTextFieldProps) {
  const [ref, setRef] = createSignal<HTMLDivElement>()
  const [linkUrl, setLinkUrl] = createSignal('')
  const [showLinkInput, setShowLinkInput] = createSignal(false)
  const [showImageInput, setShowImageInput] = createSignal(false)
  const [imageUrl, setImageUrl] = createSignal('')
  const [showColorPicker, setShowColorPicker] = createSignal(false)
  let skipUpdate = false

  const editor = createTiptapEditor(() => {
    const el = ref()
    if (!el) return undefined as unknown as { element: HTMLDivElement; extensions: any[] }
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
          placeholder: props.placeholder || 'Start writing...',
        }),
      ],
      content: props.value || '',
      editorProps: {
        attributes: {
          class: 'prose-editor-proposal',
        },
      },
      onUpdate: ({ editor: e }: { editor: Editor }) => {
        if (!skipUpdate) {
          props.onChange(e.getHTML())
        }
      },
    }
  })

  // Sync external value changes (e.g. AI replacing content)
  createEffect(on(() => props.value, (newVal) => {
    const ed = editor()
    if (!ed) return
    if (newVal !== ed.getHTML()) {
      skipUpdate = true
      ed.commands.setContent(newVal || '')
      skipUpdate = false
    }
  }))

  const insertLink = () => {
    const ed = editor()
    const url = linkUrl().trim()
    if (!ed || !url) return
    if (url) {
      ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
    setLinkUrl('')
    setShowLinkInput(false)
  }

  const removeLink = () => {
    const ed = editor()
    if (!ed) return
    ed.chain().focus().unsetLink().run()
  }

  const insertImage = () => {
    const ed = editor()
    const url = imageUrl().trim()
    if (!ed || !url) return
    ed.chain().focus().setImage({ src: url }).run()
    setImageUrl('')
    setShowImageInput(false)
  }

  const insertTable = () => {
    const ed = editor()
    if (!ed) return
    ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  const setColor = (color: string) => {
    const ed = editor()
    if (!ed) return
    ed.chain().focus().setColor(color).run()
    setShowColorPicker(false)
  }

  const COLORS = [
    '#000000', '#374151', '#991b1b', '#b45309', '#166534',
    '#1e40af', '#6b21a8', '#be185d', '#0066cc', '#dc2626',
  ]

  const btn = (active: boolean) =>
    `p-1.5 transition-colors ${
      active
        ? 'bg-ktip-ocean-600 text-white'
        : 'text-ktip-sand-600 hover:bg-ktip-sand-100'
    }`

  const iconBtn = 'p-1.5 text-ktip-sand-600 hover:bg-ktip-sand-100 transition-colors'
  const divider = 'w-px h-5 bg-ktip-sand-200 mx-0.5'

  return (
    <div
      class="border overflow-hidden transition-colors"
      classList={{
        'border-red-300': props.error,
        'border-ktip-sand-300 focus-within:border-ktip-ocean-600 focus-within:ring-1 focus-within:ring-ktip-ocean-600': !props.error,
      }}
    >
      <Show when={editor()}>
        {(ed) => (
          <div class="border-b border-ktip-sand-200 bg-ktip-sand-50">
            {/* Row 1: Text formatting + headings */}
            <div class="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-ktip-sand-100">
              <button type="button" class={btn(ed().isActive('bold'))} onClick={() => ed().chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
                <Bold size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('italic'))} onClick={() => ed().chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
                <Italic size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('underline'))} onClick={() => ed().chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
                <UnderlineIcon size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('strike'))} onClick={() => ed().chain().focus().toggleStrike().run()} title="Strikethrough">
                <Strikethrough size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('highlight'))} onClick={() => ed().chain().focus().toggleHighlight().run()} title="Highlight">
                <Highlighter size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('code'))} onClick={() => ed().chain().focus().toggleCode().run()} title="Inline Code">
                <Code size={15} />
              </button>

              <div class={divider} />

              {/* Color picker */}
              <div class="relative">
                <button type="button" class={iconBtn} onClick={() => setShowColorPicker(!showColorPicker())} title="Text Color">
                  <Palette size={15} />
                </button>
                <Show when={showColorPicker()}>
                  <div class="absolute top-full left-0 z-10 mt-1 bg-white border border-ktip-sand-200 shadow-md p-2 flex gap-1 flex-wrap w-32">
                    {COLORS.map(c => (
                      <button
                        type="button"
                        class="w-5 h-5 border border-ktip-sand-200 hover:scale-110 transition-transform"
                        style={{ background: c }}
                        onClick={() => setColor(c)}
                      />
                    ))}
                  </div>
                </Show>
              </div>

              <div class={divider} />

              <button type="button" class={btn(ed().isActive('subscript'))} onClick={() => ed().chain().focus().toggleSubscript().run()} title="Subscript">
                <SubIcon size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('superscript'))} onClick={() => ed().chain().focus().toggleSuperscript().run()} title="Superscript">
                <SupIcon size={15} />
              </button>

              <div class="flex-1" />

              {/* Undo / Redo */}
              <button type="button" class={`${iconBtn} disabled:opacity-40`} onClick={() => ed().chain().focus().undo().run()} disabled={!ed().can().undo()} title="Undo">
                <Undo size={15} />
              </button>
              <button type="button" class={`${iconBtn} disabled:opacity-40`} onClick={() => ed().chain().focus().redo().run()} disabled={!ed().can().redo()} title="Redo">
                <Redo size={15} />
              </button>
            </div>

            {/* Row 2: Headings, lists, alignment, inserts */}
            <div class="flex flex-wrap items-center gap-0.5 px-2 py-1">
              <button type="button" class={btn(ed().isActive('heading', { level: 1 }))} onClick={() => ed().chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
                <Heading1 size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('heading', { level: 2 }))} onClick={() => ed().chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
                <Heading2 size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('heading', { level: 3 }))} onClick={() => ed().chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
                <Heading3 size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('heading', { level: 4 }))} onClick={() => ed().chain().focus().toggleHeading({ level: 4 }).run()} title="Heading 4">
                <Heading4 size={15} />
              </button>

              <div class={divider} />

              <button type="button" class={btn(ed().isActive('bulletList'))} onClick={() => ed().chain().focus().toggleBulletList().run()} title="Bullet List">
                <List size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('orderedList'))} onClick={() => ed().chain().focus().toggleOrderedList().run()} title="Numbered List">
                <ListOrdered size={15} />
              </button>
              <button type="button" class={btn(ed().isActive('blockquote'))} onClick={() => ed().chain().focus().toggleBlockquote().run()} title="Blockquote">
                <Quote size={15} />
              </button>
              <button type="button" class={iconBtn} onClick={() => ed().chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
                <Minus size={15} />
              </button>

              <div class={divider} />

              {/* Text alignment */}
              <button type="button" class={btn(ed().isActive({ textAlign: 'left' }))} onClick={() => ed().chain().focus().setTextAlign('left').run()} title="Align Left">
                <AlignLeft size={15} />
              </button>
              <button type="button" class={btn(ed().isActive({ textAlign: 'center' }))} onClick={() => ed().chain().focus().setTextAlign('center').run()} title="Align Center">
                <AlignCenter size={15} />
              </button>
              <button type="button" class={btn(ed().isActive({ textAlign: 'right' }))} onClick={() => ed().chain().focus().setTextAlign('right').run()} title="Align Right">
                <AlignRight size={15} />
              </button>
              <button type="button" class={btn(ed().isActive({ textAlign: 'justify' }))} onClick={() => ed().chain().focus().setTextAlign('justify').run()} title="Justify">
                <AlignJustify size={15} />
              </button>

              <div class={divider} />

              {/* Insert: Link */}
              <div class="relative">
                <Show when={ed().isActive('link')}>
                  <button type="button" class={iconBtn} onClick={removeLink} title="Remove Link">
                    <Unlink size={15} />
                  </button>
                </Show>
                <Show when={!ed().isActive('link')}>
                  <button type="button" class={iconBtn} onClick={() => setShowLinkInput(!showLinkInput())} title="Insert Link">
                    <LinkIcon size={15} />
                  </button>
                </Show>
                <Show when={showLinkInput()}>
                  <div class="absolute top-full left-0 z-10 mt-1 bg-white border border-ktip-sand-200 shadow-md p-2 flex gap-1 w-64">
                    <input
                      type="url"
                      value={linkUrl()}
                      onInput={(e) => setLinkUrl(e.currentTarget.value)}
                      onKeyDown={(e) => e.key === 'Enter' && insertLink()}
                      placeholder="https://..."
                      class="flex-1 px-2 py-1 border border-ktip-sand-300 text-sm focus:outline-none focus:border-ktip-ocean-600"
                    />
                    <button type="button" class="px-2 py-1 bg-ktip-ocean-600 text-white text-sm" onClick={insertLink}>Add</button>
                  </div>
                </Show>
              </div>

              {/* Insert: Image */}
              <div class="relative">
                <button type="button" class={iconBtn} onClick={() => setShowImageInput(!showImageInput())} title="Insert Image">
                  <ImagePlus size={15} />
                </button>
                <Show when={showImageInput()}>
                  <div class="absolute top-full left-0 z-10 mt-1 bg-white border border-ktip-sand-200 shadow-md p-2 flex gap-1 w-64">
                    <input
                      type="url"
                      value={imageUrl()}
                      onInput={(e) => setImageUrl(e.currentTarget.value)}
                      onKeyDown={(e) => e.key === 'Enter' && insertImage()}
                      placeholder="Image URL..."
                      class="flex-1 px-2 py-1 border border-ktip-sand-300 text-sm focus:outline-none focus:border-ktip-ocean-600"
                    />
                    <button type="button" class="px-2 py-1 bg-ktip-ocean-600 text-white text-sm" onClick={insertImage}>Add</button>
                  </div>
                </Show>
              </div>

              {/* Insert: Table */}
              <button type="button" class={iconBtn} onClick={insertTable} title="Insert Table (3x3)">
                <TableIcon size={15} />
              </button>
            </div>
          </div>
        )}
      </Show>

      <div
        ref={setRef}
        style={{ 'min-height': props.minHeight || '200px' }}
      />
    </div>
  )
}
