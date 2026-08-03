import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Share2 } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { TiptapEditor } from '../../components/collaboration/TiptapEditor'
import { EditorMenuBar } from '../../components/collaboration/editor/EditorMenuBar'
import { EditorToolbarV2 } from '../../components/collaboration/editor/EditorToolbarV2'
import { LinkModal } from '../../components/collaboration/editor/LinkModal'
import { ImageModal } from '../../components/collaboration/editor/ImageModal'
import { ShareEntityModal } from '../../components/collaboration/ShareEntityModal'
import { downloadHTML, downloadMarkdown, printForPDF } from '../../lib/document-export'
import {
  useDocument,
  useDocumentPermission,
  useCreateDocument,
  useUpdateDocument,
} from '../../hooks/useDocuments'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useToolAutoSave } from '../../hooks/useToolAutoSave'
import { Button } from '../../components/ui/Button'
import { ToolPanelShell, ToolNotFound } from '../../components/ui/ToolPanelShell'
import { ToolTitleInput } from '../../components/ui/ToolTitleInput'
import { ToolStatusBar, StatusMetric, SaveIndicator } from '../../components/ui/ToolStatusBar'
import { truncate } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'

export default function DocumentEditorPage() {
    const { t } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const isNew = !params.id

  const [editor, setEditor] = useState<Editor | null>(null)
  const [docId, setDocId] = useState<string | undefined>(params.id)
  const [docTitle, setDocTitle] = useState(t`Untitled Document`)
  const [contentLoaded, setContentLoaded] = useState(false)

  // Modal states
  const [linkOpen, setLinkOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  // DB hooks
  const { document: dbDocument, error: dbDocumentError } = useDocument(params.id)
  const { permission: sharePermission } = useDocumentPermission(params.id)
  const { createDocument } = useCreateDocument()
  const { updateDocument } = useUpdateDocument()

  // Check if current user is the document owner
  const isOwner = isNew
    ? true
    : !dbDocument || !auth.user?.id
      ? true // default to owner until loaded
      : dbDocument.owner_id === auth.user.id

  // Can edit = owner OR shared with edit permission (migration 053)
  const canEdit = isOwner || sharePermission === 'edit'

  usePageTitle(docTitle || t`Document Editor`)

  // Load content from DB when document resolves
  useEffect(() => {
    if (dbDocument && editor && !contentLoaded) {
      setDocTitle(dbDocument.title)
      setDocId(dbDocument.id)
      editor.commands.setContent(dbDocument.content || '')
      setContentLoaded(true)
    }
  }, [dbDocument, editor, contentLoaded])

  // Set editor editable based on ownership
  useEffect(() => {
    if (editor) editor.setEditable(canEdit)
  }, [editor, canEdit])

  // Refs for the long-lived tiptap 'update' subscription, which would
  // otherwise close over stale state.
  const editorRef = useRef<Editor | null>(null)
  const docIdRef = useRef(docId)
  const docTitleRef = useRef(docTitle)
  editorRef.current = editor
  docIdRef.current = docId
  docTitleRef.current = docTitle

  const { status, lastSavedAt, schedule, saveNow } = useToolAutoSave({
    enabled: canEdit,
    save: async () => {
      const ed = editorRef.current
      if (!ed) return
      const html = ed.getHTML()
      const currentId = docIdRef.current

      if (currentId) {
        await updateDocument(currentId, { content: html, title: docTitleRef.current })
      } else {
        // First save — create document
        const newDoc = await createDocument({ title: docTitleRef.current, content: html })
        setDocId(newDoc.id)
        docIdRef.current = newDoc.id
        navigate(`/collaborate/document/${newDoc.id}`, { replace: true })
      }
    },
  })

  const scheduleRef = useRef(schedule)
  scheduleRef.current = schedule

  // Auto-save on editor content updates
  useEffect(() => {
    if (!editor) return
    const handleUpdate = () => scheduleRef.current()
    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor])

  // Title save on blur
  const handleTitleCommit = () => {
    if (docId && canEdit) {
      updateDocument(docId, { title: docTitle }).catch(() => {})
    }
  }

  const stats = (() => {
    if (!editor) return { words: 0, chars: 0 }
    const text = editor.state.doc.textContent
    return { chars: text.length, words: text.trim() ? text.trim().split(/\s+/).length : 0 }
  })()

  const notFound = !isNew && !!dbDocumentError

  // A brand-new document has no row yet, so there is nothing to share against —
  // ShareEntityModal would just say "save this first". Save, then open, the same
  // way the whiteboard and code sandbox do.
  const handleShare = async () => {
    if (!docId) await saveNow()
    setShareOpen(true)
  }

  return (
    <>
      <ToolPanelShell
        tool="document"
        imageSeed="documents"
        title={
          <ToolTitleInput
            value={docTitle}
            onChange={setDocTitle}
            onCommit={handleTitleCommit}
            readOnly={!canEdit}
            placeholder={t`Untitled Document`}
          />
        }
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Collaborate`, href: '/collaborate' },
          { label: t`Documents`, href: '/collaborate/documents' },
          { label: truncate(docTitle, 20) },
        ]}
        heroBadge={
          !isOwner && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                canEdit
                  ? 'bg-ktip-ocean-500/20 text-ktip-ocean-300 border-ktip-ocean-500/30'
                  : 'bg-ktip-sun-500/20 text-ktip-sun-300 border-ktip-sun-500/30'
              }`}
            >
              {canEdit ? t`Editor — Shared with you` : t`View Only — Shared with you`}
            </span>
          )
        }
        actions={
          isOwner && !notFound ? (
            <Button size="sm" icon={<Share2 size={14} />} onClick={() => void handleShare()}>
              <Trans>Invite</Trans>
            </Button>
          ) : undefined
        }
        fallback={
          notFound ? (
            <ToolNotFound
              what={t`Document`}
              backHref="/collaborate/documents"
              backLabel={t`Back to My Documents`}
            />
          ) : undefined
        }
        menuBar={
          <EditorMenuBar
            editor={editor}
            onSave={() => void saveNow()}
            onNewDocument={() => navigate('/collaborate/document/new')}
            onOpenDocuments={() => navigate('/collaborate/documents')}
            onDownloadPDF={() => editor && printForPDF(editor)}
            onDownloadHTML={() => editor && downloadHTML(editor, docTitle)}
            onDownloadMarkdown={() => editor && downloadMarkdown(editor, docTitle)}
            onShare={isOwner ? () => void handleShare() : undefined}
            onInsertLink={() => setLinkOpen(true)}
            onInsertImage={() => setImageOpen(true)}
          />
        }
        toolbar={
          <EditorToolbarV2
            editor={editor}
            onInsertLink={() => setLinkOpen(true)}
            onInsertImage={() => setImageOpen(true)}
          />
        }
        statusBar={
          <ToolStatusBar
            left={
              <>
                <StatusMetric label={t`Words`} value={stats.words.toLocaleString()} />
                <StatusMetric label={t`Characters`} value={stats.chars.toLocaleString()} />
              </>
            }
            right={
              <>
                <SaveIndicator status={status} lastSavedAt={lastSavedAt} />
                <span className="text-ktip-sand-300" aria-hidden>|</span>
                <span className="truncate max-w-[200px]">{docTitle || t`Document`}</span>
              </>
            }
          />
        }
      >
        {/* Canvas — a "paper sheet" floating on the panel background */}
        <div className="bg-ktip-sand-100 flex justify-center py-6 px-4">
          <div
            className="bg-ktip-cream w-full max-w-[850px] shadow-medium prose-editor"
            style={{ minHeight: '700px' }}
          >
            <TiptapEditor
              onEditorReady={(e) => setEditor(e)}
              placeholder={t`Start writing your document...`}
            />
          </div>
        </div>
      </ToolPanelShell>

      {/* Modals */}
      <LinkModal open={linkOpen} onClose={() => setLinkOpen(false)} editor={editor} />
      <ImageModal open={imageOpen} onClose={() => setImageOpen(false)} editor={editor} />
      <ShareEntityModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        resourceType="document"
        resourceId={docId}
        resourceTitle={docTitle}
      />
    </>
  )
}
