import { Show } from 'solid-js'
import type { Editor } from '@tiptap/core'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
} from 'lucide-solid'

interface EditorToolbarProps {
  editor: () => Editor | undefined
}

export function EditorToolbar(props: EditorToolbarProps) {
  const btn = (active: boolean) =>
    `p-2 rounded-lg transition-colors ${
      active
        ? 'bg-ktip-ocean-100 text-ktip-ocean-700'
        : 'text-ktip-sand-600 hover:bg-ktip-sand-100'
    }`

  return (
    <Show when={props.editor()}>
      {(editor) => (
        <div class="flex flex-wrap items-center gap-1 p-2 border-b border-ktip-sand-200 bg-ktip-sand-50/50">
          {/* Text formatting */}
          <button
            type="button"
            class={btn(editor().isActive('bold'))}
            onClick={() => editor().chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold size={18} />
          </button>
          <button
            type="button"
            class={btn(editor().isActive('italic'))}
            onClick={() => editor().chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic size={18} />
          </button>
          <button
            type="button"
            class={btn(editor().isActive('strike'))}
            onClick={() => editor().chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <Strikethrough size={18} />
          </button>
          <button
            type="button"
            class={btn(editor().isActive('code'))}
            onClick={() => editor().chain().focus().toggleCode().run()}
            title="Inline code"
          >
            <Code size={18} />
          </button>

          <div class="w-px h-6 bg-ktip-sand-200 mx-1" />

          {/* Headings */}
          <button
            type="button"
            class={btn(editor().isActive('heading', { level: 1 }))}
            onClick={() => editor().chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 size={18} />
          </button>
          <button
            type="button"
            class={btn(editor().isActive('heading', { level: 2 }))}
            onClick={() => editor().chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 size={18} />
          </button>
          <button
            type="button"
            class={btn(editor().isActive('heading', { level: 3 }))}
            onClick={() => editor().chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            <Heading3 size={18} />
          </button>

          <div class="w-px h-6 bg-ktip-sand-200 mx-1" />

          {/* Lists */}
          <button
            type="button"
            class={btn(editor().isActive('bulletList'))}
            onClick={() => editor().chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <List size={18} />
          </button>
          <button
            type="button"
            class={btn(editor().isActive('orderedList'))}
            onClick={() => editor().chain().focus().toggleOrderedList().run()}
            title="Ordered list"
          >
            <ListOrdered size={18} />
          </button>

          <div class="w-px h-6 bg-ktip-sand-200 mx-1" />

          {/* Block elements */}
          <button
            type="button"
            class={btn(editor().isActive('blockquote'))}
            onClick={() => editor().chain().focus().toggleBlockquote().run()}
            title="Blockquote"
          >
            <Quote size={18} />
          </button>
          <button
            type="button"
            class="p-2 rounded-lg text-ktip-sand-600 hover:bg-ktip-sand-100 transition-colors"
            onClick={() => editor().chain().focus().setHorizontalRule().run()}
            title="Horizontal rule"
          >
            <Minus size={18} />
          </button>

          <div class="flex-1" />

          {/* Undo / Redo */}
          <button
            type="button"
            class="p-2 rounded-lg text-ktip-sand-600 hover:bg-ktip-sand-100 transition-colors disabled:opacity-40"
            onClick={() => editor().chain().focus().undo().run()}
            disabled={!editor().can().undo()}
            title="Undo"
          >
            <Undo size={18} />
          </button>
          <button
            type="button"
            class="p-2 rounded-lg text-ktip-sand-600 hover:bg-ktip-sand-100 transition-colors disabled:opacity-40"
            onClick={() => editor().chain().focus().redo().run()}
            disabled={!editor().can().redo()}
            title="Redo"
          >
            <Redo size={18} />
          </button>
        </div>
      )}
    </Show>
  )
}
