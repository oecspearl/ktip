import { useState, type ComponentType } from 'react'
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
} from 'lucide-react'

interface MenuItem {
  label: string
  icon?: ComponentType<{ size?: number }>
  shortcut?: string
  action?: () => void
  separator?: boolean
}

interface EditorMenuBarProps {
  editor: Editor | null
  onSave: () => void
  onNewDocument: () => void
  onOpenDocuments?: () => void
  onDownloadPDF: () => void
  onDownloadHTML: () => void
  onDownloadMarkdown: () => void
  /** Omitted for non-owners: only the owner can create shares (RLS on document_shares). */
  onShare?: () => void
  onInsertLink: () => void
  onInsertImage: () => void
}

export function EditorMenuBar(props: EditorMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const toggle = (menu: string) => {
    setOpenMenu((prev) => (prev === menu ? null : menu))
  }

  const close = () => setOpenMenu(null)

  const handleAction = (action?: () => void) => {
    action?.()
    close()
  }

  const ed = props.editor

  const fileItems: MenuItem[] = [
    { label: 'New Document', icon: FilePlus, action: props.onNewDocument },
    { label: 'Open...', icon: FolderOpen, action: props.onOpenDocuments },
    { label: 'Save', icon: Save, shortcut: 'Ctrl+S', action: props.onSave },
    { label: '', separator: true },
    { label: 'Download as PDF', icon: FileDown, action: props.onDownloadPDF },
    { label: 'Download as HTML', icon: FileText, action: props.onDownloadHTML },
    { label: 'Download as Markdown', icon: FileCode, action: props.onDownloadMarkdown },
    // Share also has a primary button above the panel — this stays as the
    // keyboard/menu route to the same modal, and disappears for non-owners.
    ...(props.onShare
      ? ([
          { label: '', separator: true },
          { label: 'Share Document', icon: Share2, action: props.onShare },
        ] as MenuItem[])
      : []),
  ]

  const editItems: MenuItem[] = [
    { label: 'Undo', icon: Undo, shortcut: 'Ctrl+Z', action: () => ed?.chain().focus().undo().run() },
    { label: 'Redo', icon: Redo, shortcut: 'Ctrl+Shift+Z', action: () => ed?.chain().focus().redo().run() },
    { label: '', separator: true },
    { label: 'Select All', shortcut: 'Ctrl+A', action: () => ed?.chain().focus().selectAll().run() },
    { label: 'Clear Formatting', icon: Eraser, action: () => ed?.chain().focus().unsetAllMarks().clearNodes().run() },
  ]

  const insertItems: MenuItem[] = [
    { label: 'Link...', icon: Link, action: props.onInsertLink },
    { label: 'Image...', icon: ImageIcon, action: props.onInsertImage },
    { label: 'Horizontal Rule', icon: Minus, action: () => ed?.chain().focus().setHorizontalRule().run() },
    { label: 'Table (3x3)', icon: Table, action: () => ed?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { label: 'Code Block', icon: Code2, action: () => ed?.chain().focus().toggleCodeBlock().run() },
  ]

  const formatItems: MenuItem[] = [
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

  const menus: { label: string; items: MenuItem[] }[] = [
    { label: 'File', items: fileItems },
    { label: 'Edit', items: editItems },
    { label: 'Insert', items: insertItems },
    { label: 'Format', items: formatItems },
  ]

  return (
    <div
      className="relative flex items-center bg-ktip-sand-50 border-b border-ktip-sand-200 select-none"
      onMouseLeave={close}
    >
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            type="button"
            className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
              openMenu === menu.label
                ? 'bg-ktip-ocean-100 text-ktip-ocean-700'
                : 'text-ktip-sand-600 hover:text-ktip-sand-900 hover:bg-ktip-sand-100'
            }`}
            onClick={() => toggle(menu.label)}
            onMouseEnter={() => {
              if (openMenu) setOpenMenu(menu.label)
            }}
          >
            {menu.label}
            <ChevronDown size={12} />
          </button>

          {openMenu === menu.label && (
            <div className="absolute left-0 top-full z-50 min-w-[220px] bg-ktip-cream border border-ktip-sand-200 rounded-lg shadow-medium py-1">
              {menu.items.map((item, idx) =>
                item.separator ? (
                  <div key={idx} className="h-px bg-ktip-sand-200 my-1 mx-2" />
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-ktip-sand-700 hover:bg-ktip-sand-100 hover:text-ktip-sand-900 transition-colors text-left"
                    onClick={() => handleAction(item.action)}
                  >
                    {item.icon && <item.icon size={14} />}
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <span className="text-xs text-ktip-sand-400 ml-4">{item.shortcut}</span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
