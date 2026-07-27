import { createSignal, Show, For } from 'solid-js'
import type { Editor } from '@tiptap/core'
import {
  FilePlus,
  FolderOpen,
  Save,
  FileDown,
  FileText,
  FileCode,
  Share2,
  Undo,
  Redo,
  Eraser,
  Link,
  ImageIcon,
  Minus,
  Table,
  Code2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Subscript,
  Superscript,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ChevronDown,
} from 'lucide-solid'
import type { JSX } from 'solid-js'

interface MenuItem {
  label: string
  icon?: (props: { size: number }) => JSX.Element
  shortcut?: string
  action?: () => void
  separator?: boolean
}

interface EditorMenuBarProps {
  editor: () => Editor | undefined
  onSave: () => void
  onNewDocument: () => void
  onOpenDocuments?: () => void
  onDownloadPDF: () => void
  onDownloadHTML: () => void
  onDownloadMarkdown: () => void
  onShare: () => void
  onInsertLink: () => void
  onInsertImage: () => void
}

export function EditorMenuBar(props: EditorMenuBarProps) {
  const [openMenu, setOpenMenu] = createSignal<string | null>(null)

  const toggle = (menu: string) => {
    setOpenMenu(openMenu() === menu ? null : menu)
  }

  const close = () => setOpenMenu(null)

  const handleAction = (action?: () => void) => {
    action?.()
    close()
  }

  const fileItems = (): MenuItem[] => [
    { label: 'New Document', icon: FilePlus, action: props.onNewDocument },
    { label: 'Open...', icon: FolderOpen, action: props.onOpenDocuments },
    { label: 'Save', icon: Save, shortcut: 'Ctrl+S', action: props.onSave },
    { label: '', separator: true },
    { label: 'Download as PDF', icon: FileDown, action: props.onDownloadPDF },
    { label: 'Download as HTML', icon: FileText, action: props.onDownloadHTML },
    { label: 'Download as Markdown', icon: FileCode, action: props.onDownloadMarkdown },
    { label: '', separator: true },
    { label: 'Share Document', icon: Share2, action: props.onShare },
  ]

  const editItems = (): MenuItem[] => {
    const ed = props.editor()
    return [
      { label: 'Undo', icon: Undo, shortcut: 'Ctrl+Z', action: () => ed?.chain().focus().undo().run() },
      { label: 'Redo', icon: Redo, shortcut: 'Ctrl+Shift+Z', action: () => ed?.chain().focus().redo().run() },
      { label: '', separator: true },
      { label: 'Select All', shortcut: 'Ctrl+A', action: () => ed?.chain().focus().selectAll().run() },
      { label: 'Clear Formatting', icon: Eraser, action: () => ed?.chain().focus().unsetAllMarks().clearNodes().run() },
    ]
  }

  const insertItems = (): MenuItem[] => {
    const ed = props.editor()
    return [
      { label: 'Link...', icon: Link, action: props.onInsertLink },
      { label: 'Image...', icon: ImageIcon, action: props.onInsertImage },
      { label: 'Horizontal Rule', icon: Minus, action: () => ed?.chain().focus().setHorizontalRule().run() },
      { label: 'Table (3x3)', icon: Table, action: () => ed?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
      { label: 'Code Block', icon: Code2, action: () => ed?.chain().focus().toggleCodeBlock().run() },
    ]
  }

  const formatItems = (): MenuItem[] => {
    const ed = props.editor()
    return [
      { label: 'Bold', icon: Bold, shortcut: 'Ctrl+B', action: () => ed?.chain().focus().toggleBold().run() },
      { label: 'Italic', icon: Italic, shortcut: 'Ctrl+I', action: () => ed?.chain().focus().toggleItalic().run() },
      { label: 'Underline', icon: Underline, shortcut: 'Ctrl+U', action: () => ed?.chain().focus().toggleUnderline().run() },
      { label: 'Strikethrough', icon: Strikethrough, action: () => ed?.chain().focus().toggleStrike().run() },
      { label: 'Highlight', icon: Highlighter, action: () => ed?.chain().focus().toggleHighlight().run() },
      { label: 'Subscript', icon: Subscript, action: () => ed?.chain().focus().toggleSubscript().run() },
      { label: 'Superscript', icon: Superscript, action: () => ed?.chain().focus().toggleSuperscript().run() },
      { label: '', separator: true },
      { label: 'Align Left', icon: AlignLeft, action: () => ed?.chain().focus().setTextAlign('left').run() },
      { label: 'Align Center', icon: AlignCenter, action: () => ed?.chain().focus().setTextAlign('center').run() },
      { label: 'Align Right', icon: AlignRight, action: () => ed?.chain().focus().setTextAlign('right').run() },
      { label: 'Justify', icon: AlignJustify, action: () => ed?.chain().focus().setTextAlign('justify').run() },
    ]
  }

  const menus: { label: string; items: () => MenuItem[] }[] = [
    { label: 'File', items: fileItems },
    { label: 'Edit', items: editItems },
    { label: 'Insert', items: insertItems },
    { label: 'Format', items: formatItems },
  ]

  return (
    <div
      class="relative flex items-center bg-[#2c2c2e] border-b border-gray-700 select-none"
      onMouseLeave={close}
    >
      <For each={menus}>
        {(menu) => (
          <div class="relative">
            <button
              type="button"
              class={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
                openMenu() === menu.label
                  ? 'bg-white/15 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
              onClick={() => toggle(menu.label)}
              onMouseEnter={() => {
                if (openMenu()) setOpenMenu(menu.label)
              }}
            >
              {menu.label}
              <ChevronDown size={12} />
            </button>

            <Show when={openMenu() === menu.label}>
              <div class="absolute left-0 top-full z-50 min-w-[220px] bg-[#3a3a3c] border border-gray-600 rounded-lg shadow-hard py-1">
                <For each={menu.items()}>
                  {(item) => (
                    <Show
                      when={!item.separator}
                      fallback={<div class="h-px bg-gray-600 my-1 mx-2" />}
                    >
                      <button
                        type="button"
                        class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors text-left"
                        onClick={() => handleAction(item.action)}
                      >
                        {item.icon && (() => {
                          const IconComp = item.icon!
                          return <IconComp size={14} />
                        })()}
                        <span class="flex-1">{item.label}</span>
                        <Show when={item.shortcut}>
                          <span class="text-xs text-gray-500 ml-4">{item.shortcut}</span>
                        </Show>
                      </button>
                    </Show>
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}
