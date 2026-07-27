import { createSignal, createEffect, createMemo, onCleanup, Show } from 'solid-js'
import { A, useParams, useNavigate } from '@solidjs/router'
import type { Editor } from '@tiptap/core'
import { MainLayout } from '../../components/layout/MainLayout'
import { TiptapEditor } from '../../components/collaboration/TiptapEditor'
import { EditorMenuBar } from '../../components/collaboration/editor/EditorMenuBar'
import { EditorToolbarV2 } from '../../components/collaboration/editor/EditorToolbarV2'
import { EditorStatusBar } from '../../components/collaboration/editor/EditorStatusBar'
import { LinkModal } from '../../components/collaboration/editor/LinkModal'
import { ImageModal } from '../../components/collaboration/editor/ImageModal'
import { ShareDocumentModal } from '../../components/collaboration/editor/ShareDocumentModal'
import { downloadHTML, downloadMarkdown, printForPDF } from '../../lib/document-export'
import { useDocument, useCreateDocument, useUpdateDocument } from '../../hooks/useDocuments'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { ChevronRight } from 'lucide-solid'

export default function DocumentEditorPage() {
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const auth = useAuth()
  const isNew = () => !params.id

  const [editor, setEditor] = createSignal<Editor | undefined>()
  const [docId, setDocId] = createSignal<string | undefined>(params.id)
  const [docTitle, setDocTitle] = createSignal('Untitled Document')
  const [saveStatus, setSaveStatus] = createSignal<'saved' | 'saving' | 'unsaved'>('saved')
  const [contentLoaded, setContentLoaded] = createSignal(false)

  // Modal states
  const [linkOpen, setLinkOpen] = createSignal(false)
  const [imageOpen, setImageOpen] = createSignal(false)
  const [shareOpen, setShareOpen] = createSignal(false)

  // DB hooks
  const { document: dbDocument } = useDocument(() => params.id)
  const { createDocument } = useCreateDocument()
  const { updateDocument } = useUpdateDocument()

  // Check if current user is the document owner
  const isOwner = createMemo(() => {
    if (isNew()) return true
    const doc = dbDocument()
    const userId = auth.user()?.id
    if (!doc || !userId) return true // default to owner until loaded
    return doc.owner_id === userId
  })

  usePageTitle(() => docTitle() || 'Document Editor')

  const tiptap = TiptapEditor({
    onEditorReady: (e) => setEditor(e),
    placeholder: 'Start writing your document...',
  })

  // Load content from DB when document resolves
  createEffect(() => {
    const doc = dbDocument()
    const ed = editor()
    if (doc && ed && !contentLoaded()) {
      setDocTitle(doc.title)
      setDocId(doc.id)
      ed.commands.setContent(doc.content || '')
      setContentLoaded(true)
      setSaveStatus('saved')
    }
  })

  // Set editor editable based on ownership
  createEffect(() => {
    const ed = editor()
    if (ed) ed.setEditable(isOwner())
  })

  // Auto-save to DB
  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined

  const saveToDb = async () => {
    const ed = editor()
    if (!ed || !isOwner()) return

    setSaveStatus('saving')
    const html = ed.getHTML()
    const currentId = docId()

    try {
      if (currentId) {
        await updateDocument(currentId, { content: html, title: docTitle() })
      } else {
        // First save — create document
        const newDoc = await createDocument({ title: docTitle(), content: html })
        setDocId(newDoc.id)
        navigate(`/collaborate/document/${newDoc.id}`, { replace: true })
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('unsaved')
    }
  }

  createEffect(() => {
    const ed = editor()
    if (!ed) return

    const handleUpdate = () => {
      setSaveStatus('unsaved')
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
      autoSaveTimer = setTimeout(() => saveToDb(), 1500)
    }

    ed.on('update', handleUpdate)
    onCleanup(() => {
      ed.off('update', handleUpdate)
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
        // Save immediately on cleanup
        const currentId = docId()
        if (currentId) {
          const html = ed.getHTML()
          supabaseSync(currentId, html, docTitle())
        }
      }
    })
  })

  // Sync helper for cleanup/beforeunload (fire-and-forget)
  const supabaseSync = (id: string, content: string, title: string) => {
    // Use sendBeacon-style approach: just fire the request
    updateDocument(id, { content, title }).catch(() => {})
  }

  // Save before page unload
  const handleBeforeUnload = () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    const ed = editor()
    const currentId = docId()
    if (ed && currentId) {
      supabaseSync(currentId, ed.getHTML(), docTitle())
    }
  }

  window.addEventListener('beforeunload', handleBeforeUnload)
  onCleanup(() => window.removeEventListener('beforeunload', handleBeforeUnload))

  // Manual save
  const handleSave = () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    saveToDb()
  }

  // New document
  const handleNewDocument = () => {
    navigate('/collaborate/document/new')
  }

  // Title save on blur
  const handleTitleBlur = () => {
    const currentId = docId()
    if (currentId) {
      updateDocument(currentId, { title: docTitle() }).catch(() => {})
    }
  }

  // Ctrl+S
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  onCleanup(() => window.removeEventListener('keydown', handleKeyDown))

  const handleDownloadPDF = () => {
    const ed = editor()
    if (ed) printForPDF(ed)
  }

  const handleDownloadHTML = () => {
    const ed = editor()
    if (ed) downloadHTML(ed, docTitle())
  }

  const handleDownloadMarkdown = () => {
    const ed = editor()
    if (ed) downloadMarkdown(ed, docTitle())
  }

  return (
    <MainLayout>
      {/* Dark Hero Band */}
      <div class="bg-gray-800 min-h-[140px] flex items-center">
        <div class="max-w-5xl mx-auto px-4 w-full flex items-center justify-between">
          <div class="flex-1 min-w-0">
            <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Collaboration Tools</p>
            <input
              type="text"
              value={docTitle()}
              onInput={(e) => setDocTitle(e.currentTarget.value)}
              onBlur={handleTitleBlur}
              readOnly={!isOwner()}
              class="text-3xl md:text-4xl font-display font-bold text-white bg-transparent border-none focus:outline-none w-full placeholder-gray-500"
              placeholder="Untitled Document"
            />
            <Show when={!isOwner()}>
              <span class="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                View Only — Shared with you
              </span>
            </Show>
          </div>
          <nav class="hidden md:flex items-center gap-1 text-sm text-gray-400 shrink-0 ml-4">
            <A href="/" class="hover:text-white transition-colors">Home</A>
            <ChevronRight size={14} />
            <A href="/collaborate" class="hover:text-white transition-colors">Collaborate</A>
            <ChevronRight size={14} />
            <A href="/collaborate/documents" class="hover:text-white transition-colors">Documents</A>
            <ChevronRight size={14} />
            <span class="text-gray-200 truncate max-w-[150px]">{docTitle()}</span>
          </nav>
        </div>
      </div>

      {/* Document not found */}
      <Show when={!isNew() && dbDocument.error}>
        <div class="bg-white py-16 text-center">
          <h2 class="text-xl font-semibold text-ktip-sand-800 mb-2">Document not found</h2>
          <p class="text-ktip-sand-500 mb-4">This document may have been deleted or you don't have access.</p>
          <A href="/collaborate/documents" class="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium">
            Back to My Documents
          </A>
        </div>
      </Show>

      {/* Editor Section */}
      <Show when={isNew() || !dbDocument.error}>
        <div class="bg-[#e8e8e8] py-8 min-h-[calc(100vh-200px)]">
          <div class="max-w-5xl mx-auto px-4">
            <div class="border border-gray-600 overflow-hidden shadow-hard">
              {/* Menu Bar */}
              <EditorMenuBar
                editor={() => editor()}
                onSave={handleSave}
                onNewDocument={handleNewDocument}
                onOpenDocuments={() => navigate('/collaborate/documents')}
                onDownloadPDF={handleDownloadPDF}
                onDownloadHTML={handleDownloadHTML}
                onDownloadMarkdown={handleDownloadMarkdown}
                onShare={() => setShareOpen(true)}
                onInsertLink={() => setLinkOpen(true)}
                onInsertImage={() => setImageOpen(true)}
              />

              {/* Toolbar */}
              <EditorToolbarV2
                editor={() => editor()}
                onInsertLink={() => setLinkOpen(true)}
                onInsertImage={() => setImageOpen(true)}
              />

              {/* Canvas Area */}
              <div class="bg-[#e8e8e8] flex justify-center py-6 px-4">
                <div
                  class="bg-white w-full max-w-[850px] shadow-medium prose-editor"
                  style={{ "min-height": "700px" }}
                >
                  <div ref={tiptap.ref} />
                </div>
              </div>

              {/* Status Bar */}
              <EditorStatusBar
                editor={() => editor()}
                saveStatus={saveStatus}
                title={() => docTitle()}
              />
            </div>
          </div>
        </div>
      </Show>

      {/* Modals */}
      <LinkModal
        open={linkOpen()}
        onClose={() => setLinkOpen(false)}
        editor={() => editor()}
      />
      <ImageModal
        open={imageOpen()}
        onClose={() => setImageOpen(false)}
        editor={() => editor()}
      />
      <ShareDocumentModal
        open={shareOpen()}
        onClose={() => setShareOpen(false)}
        editor={() => editor()}
        documentId={() => docId()}
        documentTitle={() => docTitle()}
      />
    </MainLayout>
  )
}
