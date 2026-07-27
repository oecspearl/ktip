import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import type { Editor } from '@tiptap/core'
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
import { ChevronRight } from 'lucide-react'

export default function DocumentEditorPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const isNew = !params.id

  const [editor, setEditor] = useState<Editor | null>(null)
  const [docId, setDocId] = useState<string | undefined>(params.id)
  const [docTitle, setDocTitle] = useState('Untitled Document')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [contentLoaded, setContentLoaded] = useState(false)

  // Modal states
  const [linkOpen, setLinkOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  // DB hooks
  const { document: dbDocument, error: dbDocumentError } = useDocument(params.id)
  const { createDocument } = useCreateDocument()
  const { updateDocument } = useUpdateDocument()

  // Check if current user is the document owner
  const isOwner = isNew
    ? true
    : !dbDocument || !auth.user?.id
      ? true // default to owner until loaded
      : dbDocument.owner_id === auth.user.id

  usePageTitle(docTitle || 'Document Editor')

  // Load content from DB when document resolves
  useEffect(() => {
    if (dbDocument && editor && !contentLoaded) {
      setDocTitle(dbDocument.title)
      setDocId(dbDocument.id)
      editor.commands.setContent(dbDocument.content || '')
      setContentLoaded(true)
      setSaveStatus('saved')
    }
  }, [dbDocument, editor, contentLoaded])

  // Set editor editable based on ownership
  useEffect(() => {
    if (editor) editor.setEditable(isOwner)
  }, [editor, isOwner])

  // --- Refs that mirror the latest render's values, used by long-lived
  // listeners/timers (tiptap 'update' subscription, beforeunload, unmount
  // cleanup) that would otherwise close over stale state. ---
  const editorRef = useRef<Editor | null>(null)
  const docIdRef = useRef(docId)
  const docTitleRef = useRef(docTitle)
  const updateDocumentRef = useRef(updateDocument)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  editorRef.current = editor
  docIdRef.current = docId
  docTitleRef.current = docTitle
  updateDocumentRef.current = updateDocument

  const saveToDb = async () => {
    const ed = editor
    if (!ed || !isOwner) return

    setSaveStatus('saving')
    const html = ed.getHTML()
    const currentId = docIdRef.current

    try {
      if (currentId) {
        await updateDocument(currentId, { content: html, title: docTitleRef.current })
      } else {
        // First save — create document
        const newDoc = await createDocument({ title: docTitleRef.current, content: html })
        setDocId(newDoc.id)
        docIdRef.current = newDoc.id
        navigate(`/collaborate/document/${newDoc.id}`, { replace: true })
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('unsaved')
    }
  }
  const saveToDbRef = useRef(saveToDb)
  saveToDbRef.current = saveToDb

  // Auto-save on editor content updates
  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      setSaveStatus('unsaved')
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = setTimeout(() => saveToDbRef.current(), 1500)
    }

    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        // Save immediately on cleanup
        const currentId = docIdRef.current
        if (currentId) {
          const html = editor.getHTML()
          updateDocumentRef.current(currentId, { content: html, title: docTitleRef.current }).catch(() => {})
        }
      }
    }
  }, [editor])

  // Save before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      const ed = editorRef.current
      const currentId = docIdRef.current
      if (ed && currentId) {
        updateDocumentRef.current(currentId, { content: ed.getHTML(), title: docTitleRef.current }).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        saveToDbRef.current()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Manual save
  const handleSave = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    saveToDb()
  }

  // New document
  const handleNewDocument = () => {
    navigate('/collaborate/document/new')
  }

  // Title save on blur
  const handleTitleBlur = () => {
    if (docId) {
      updateDocument(docId, { title: docTitle }).catch(() => {})
    }
  }

  const handleDownloadPDF = () => {
    if (editor) printForPDF(editor)
  }

  const handleDownloadHTML = () => {
    if (editor) downloadHTML(editor, docTitle)
  }

  const handleDownloadMarkdown = () => {
    if (editor) downloadMarkdown(editor, docTitle)
  }

  return (
    <>
      {/* Dark Hero Band */}
      <div className="bg-gray-800 min-h-[140px] flex items-center">
        <div className="max-w-5xl mx-auto px-4 w-full flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Collaboration Tools</p>
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              onBlur={handleTitleBlur}
              readOnly={!isOwner}
              className="text-3xl md:text-4xl font-display font-bold text-white bg-transparent border-none focus:outline-none w-full placeholder-gray-500"
              placeholder="Untitled Document"
            />
            {!isOwner && (
              <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                View Only — Shared with you
              </span>
            )}
          </div>
          <nav className="hidden md:flex items-center gap-1 text-sm text-gray-400 shrink-0 ml-4">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight size={14} />
            <Link to="/collaborate" className="hover:text-white transition-colors">Collaborate</Link>
            <ChevronRight size={14} />
            <Link to="/collaborate/documents" className="hover:text-white transition-colors">Documents</Link>
            <ChevronRight size={14} />
            <span className="text-gray-200 truncate max-w-[150px]">{docTitle}</span>
          </nav>
        </div>
      </div>

      {/* Document not found */}
      {!isNew && dbDocumentError && (
        <div className="bg-white py-16 text-center">
          <h2 className="text-xl font-semibold text-ktip-sand-800 mb-2">Document not found</h2>
          <p className="text-ktip-sand-500 mb-4">This document may have been deleted or you don't have access.</p>
          <Link to="/collaborate/documents" className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium">
            Back to My Documents
          </Link>
        </div>
      )}

      {/* Editor Section */}
      {(isNew || !dbDocumentError) && (
        <div className="bg-[#e8e8e8] py-8 min-h-[calc(100vh-200px)]">
          <div className="max-w-5xl mx-auto px-4">
            <div className="border border-gray-600 overflow-hidden shadow-hard">
              {/* Menu Bar */}
              <EditorMenuBar
                editor={editor}
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
                editor={editor}
                onInsertLink={() => setLinkOpen(true)}
                onInsertImage={() => setImageOpen(true)}
              />

              {/* Canvas Area */}
              <div className="bg-[#e8e8e8] flex justify-center py-6 px-4">
                <div
                  className="bg-white w-full max-w-[850px] shadow-medium prose-editor"
                  style={{ minHeight: '700px' }}
                >
                  <TiptapEditor onEditorReady={(e) => setEditor(e)} placeholder="Start writing your document..." />
                </div>
              </div>

              {/* Status Bar */}
              <EditorStatusBar
                editor={editor}
                saveStatus={saveStatus}
                title={docTitle}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <LinkModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        editor={editor}
      />
      <ImageModal
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        editor={editor}
      />
      <ShareDocumentModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        editor={editor}
        documentId={docId}
        documentTitle={docTitle}
      />
    </>
  )
}
