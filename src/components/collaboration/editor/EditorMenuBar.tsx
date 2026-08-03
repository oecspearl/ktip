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
import { useLingui } from '@lingui/react/macro'

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
    const { t } = useLingui()
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
    { label: t`New Document`, icon: FilePlus, action: props.onNewDocument },
    { label: t`Open...`, icon: FolderOpen, action: props.onOpenDocuments },
    { label: t`Save`, icon: Save, shortcut: 'Ctrl+S', action: props.onSave },
    { label: '', separator: true },
    { label: t`Download as PDF`, icon: FileDown, action: props.onDownloadPDF },
    { label: t`Download as HTML`, icon: FileText, action: props.onDownloadHTML },
    { label: t`Download as Markdown`, icon: FileCode, action: props.onDownloadMarkdown },
    // Share also has a primary button above the panel — this stays as the
    // keyboard/menu route to the same modal, and disappears for non-owners.
    ...(props.onShare
      ? ([
          { label: '', separator: true },
          { label: t`Share Document`, icon: Share2, action: props.onShare },
        ] as MenuItem[])
      : []),
  ]

  const editItems: MenuItem[] = [
    { label: t`Undo`, icon: Undo, shortcut: 'Ctrl+Z', action: () => ed?.chain().focus().undo().run() },
    { label: t`Redo`, icon: Redo, shortcut: 'Ctrl+Shift+Z', action: () => ed?.chain().focus().redo().run() },
    { label: '', separator: true },
    { label: t`Select All`, shortcut: 'Ctrl+A', action: () => ed?.chain().focus().selectAll().run() },
    { label: t`Clear Formatting`, icon: Eraser, action: () => ed?.chain().focus().unsetAllMarks().clearNodes().run() },
  ]

  const insertItems: MenuItem[] = [
    { label: t`Link...`, icon: Link, action: props.onInsertLink },
    { label: t`Image...`, icon: ImageIcon, action: props.onInsertImage },
    { label: t`Horizontal Rule`, icon: Minus, action: () => ed?.chain().focus().setHorizontalRule().run() },
    { label: t`Table (3x3)`, icon: Table, action: () => ed?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { label: t`Code Block`, icon: Code2, action: () => ed?.chain().focus().toggleCodeBlock().run() },
  ]

  const formatItems: MenuItem[] = [
    { label: t`Bold`, icon: Bold, shortcut: 'Ctrl+B', action: () => ed?.chain().focus().toggleBold().run() },
    { label: t`Italic`, icon: Italic, shortcut: 'Ctrl+I', action: () => ed?.chain().focus().toggleItalic().run() },
    { label: t`Underline`, icon: Underline, shortcut: 'Ctrl+U', action: () => ed?.chain().focus().toggleUnderline().run() },
    { label: t`Strikethrough`, icon: Strikethrough, action: () => ed?.chain().focus().toggleStrike().run() },
    { label: t`Highlight`, icon: Highlighter, action: () => ed?.chain().focus().toggleHighlight().run() },
    { label: t`Subscript`, icon: Subscript, action: () => ed?.chain().focus().toggleSubscript().run() },
    { label: t`Superscript`, icon: Superscript, action: () => ed?.chain().focus().toggleSuperscript().run() },
    { label: '', separator: true },
    { label: t`Align Left`, icon: AlignLeft, action: () => ed?.chain().focus().setTextAlign('left').run() },
    { label: t`Align Center`, icon: AlignCenter, action: () => ed?.chain().focus().setTextAlign('center').run() },
    { label: t`Align Right`, icon: AlignRight, action: () => ed?.chain().focus().setTextAlign('right').run() },
    { label: t`Justify`, icon: AlignJustify, action: () => ed?.chain().focus().setTextAlign('justify').run() },
  ]

  const menus: { label: string; items: MenuItem[] }[] = [
    { label: t`File`, items: fileItems },
    { label: t`Edit`, items: editItems },
    { label: t`Insert`, items: insertItems },
    { label: t`Format`, items: formatItems },
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
            <div className="absolute left-0 top-full z-dropdown min-w-[220px] bg-ktip-cream border border-ktip-sand-200 rounded-lg shadow-medium py-1">
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
