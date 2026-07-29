import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { TldrawWrapper } from '../../components/collaboration/TldrawWrapper'
import { ShareEntityModal } from '../../components/collaboration/ShareEntityModal'
import { useWhiteboard, useWhiteboardPermission, useCreateWhiteboard, useUpdateWhiteboard } from '../../hooks/useWhiteboards'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useToolAutoSave } from '../../hooks/useToolAutoSave'
import { Download, Share2, Save } from 'lucide-react'
import { ToolPanelShell, ToolNotFound } from '../../components/ui/ToolPanelShell'
import { ToolTitleInput } from '../../components/ui/ToolTitleInput'
import { ToolStatusBar, StatusMetric, SaveIndicator } from '../../components/ui/ToolStatusBar'
import { Toolbar, ToolbarButton, ToolbarSeparator, ToolbarSpacer } from '../../components/ui/Toolbar'
import { truncate } from '../../lib/utils'

export default function WhiteboardPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const isNew = !params.id

  const [editor, setEditor] = useState<any>(null)
  const [wbId, setWbId] = useState<string | undefined>(params.id)
  const [wbTitle, setWbTitle] = useState('Untitled Whiteboard')
  const [shareOpen, setShareOpen] = useState(false)
  const [snapshotLoaded, setSnapshotLoaded] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [shapeCount, setShapeCount] = useState(0)

  // DB hooks
  const { whiteboard: dbWhiteboard, error: dbWhiteboardError } = useWhiteboard(params.id)
  const { permission: sharePermission } = useWhiteboardPermission(params.id)
  const { createWhiteboard } = useCreateWhiteboard()
  const { updateWhiteboard } = useUpdateWhiteboard()

  // Check ownership
  const isOwner = isNew
    ? true
    : !dbWhiteboard || !auth.user?.id
      ? true
      : dbWhiteboard.owner_id === auth.user.id

  // Can edit = owner OR shared with edit permission
  const canEdit = isOwner || sharePermission === 'edit'

  usePageTitle(wbTitle || 'Whiteboard')

  // Load title from DB when whiteboard resolves
  useEffect(() => {
    if (dbWhiteboard && !snapshotLoaded) {
      setWbTitle(dbWhiteboard.title)
      setWbId(dbWhiteboard.id)
      setSnapshotLoaded(true)
    }
  }, [dbWhiteboard, snapshotLoaded])

  // Refs for the long-lived tldraw store listener, which would otherwise
  // close over stale state.
  const editorRef = useRef<any>(null)
  const wbIdRef = useRef(wbId)
  const wbTitleRef = useRef(wbTitle)
  const storeCleanupRef = useRef<(() => void) | undefined>(undefined)

  wbIdRef.current = wbId
  wbTitleRef.current = wbTitle

  const { status, lastSavedAt, schedule, saveNow } = useToolAutoSave({
    enabled: canEdit,
    save: async () => {
      const ed = editorRef.current
      if (!ed) return
      const snapshot = ed.getSnapshot()
      const currentId = wbIdRef.current

      if (currentId) {
        await updateWhiteboard(currentId, { snapshot, title: wbTitleRef.current })
      } else {
        const newWb = await createWhiteboard({ title: wbTitleRef.current, snapshot })
        setWbId(newWb.id)
        wbIdRef.current = newWb.id
        navigate(`/collaborate/whiteboard/${newWb.id}`, { replace: true })
      }
    },
  })

  const scheduleRef = useRef(schedule)
  scheduleRef.current = schedule

  const handleEditorReady = (ed: any) => {
    setEditor(ed)
    editorRef.current = ed
    setShapeCount(ed.getCurrentPageShapeIds().size ?? 0)
    // Listen for document-level store changes (shapes, pages, styles — not viewport/cursor)
    storeCleanupRef.current = ed.store.listen(
      () => {
        setShapeCount(ed.getCurrentPageShapeIds().size ?? 0)
        scheduleRef.current()
      },
      { scope: 'document' }
    )
  }

  useEffect(() => () => storeCleanupRef.current?.(), [])

  // Title save on blur
  const handleTitleCommit = () => {
    if (wbId && canEdit) {
      updateWhiteboard(wbId, { title: wbTitle }).catch(() => {})
    }
  }

  // Export handlers
  const exportImage = async (format: 'png' | 'svg') => {
    const ed = editor
    if (!ed) return
    const { exportAs } = await import('tldraw')
    const ids = Array.from(ed.getCurrentPageShapeIds()) as any[]
    if (ids.length === 0) return
    await exportAs(ed, ids, { format: format as any, name: wbTitle })
    setExportOpen(false)
  }

  const handleExportJSON = () => {
    const ed = editor
    if (!ed) return
    const snapshot = ed.getSnapshot()
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${wbTitle || 'whiteboard'}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  // Determine initial snapshot for TldrawWrapper
  const initialSnapshot = isNew ? null : dbWhiteboard?.snapshot || null

  // Wait for DB data before rendering tldraw (for existing whiteboards)
  const readyToRender = isNew ? true : snapshotLoaded
  const notFound = !isNew && !!dbWhiteboardError

  return (
    <>
      <ToolPanelShell
        tool="whiteboard"
        imageSeed="whiteboards"
        title={
          <ToolTitleInput
            value={wbTitle}
            onChange={setWbTitle}
            onCommit={handleTitleCommit}
            readOnly={!canEdit}
            placeholder="Untitled Whiteboard"
          />
        }
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Collaborate', href: '/collaborate' },
          { label: 'Whiteboards', href: '/collaborate/whiteboards' },
          { label: truncate(wbTitle, 20) },
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
              {canEdit ? 'Editor — Shared with you' : 'View Only — Shared with you'}
            </span>
          )
        }
        fallback={
          notFound ? (
            <ToolNotFound
              what="Whiteboard"
              backHref="/collaborate/whiteboards"
              backLabel="Back to My Whiteboards"
            />
          ) : undefined
        }
        toolbar={
          <Toolbar>
            <ToolbarButton
              icon={<Save size={14} />}
              label="Save"
              onClick={() => void saveNow()}
              disabled={!canEdit}
              title="Save now (Ctrl+S)"
            />
            <ToolbarSeparator />
            <div className="relative">
              <ToolbarButton
                icon={<Download size={14} />}
                label="Export"
                active={exportOpen}
                onClick={() => setExportOpen(!exportOpen)}
                title="Export whiteboard"
              />
              {exportOpen && (
                <div className="absolute left-0 top-full mt-1 w-44 bg-ktip-cream border border-ktip-sand-200 rounded-lg shadow-medium z-30 py-1">
                  <button type="button" onClick={() => void exportImage('png')} className="w-full text-left px-3 py-2 text-sm text-ktip-sand-700 hover:bg-ktip-sand-100">Export as PNG</button>
                  <button type="button" onClick={() => void exportImage('svg')} className="w-full text-left px-3 py-2 text-sm text-ktip-sand-700 hover:bg-ktip-sand-100">Export as SVG</button>
                  <button type="button" onClick={handleExportJSON} className="w-full text-left px-3 py-2 text-sm text-ktip-sand-700 hover:bg-ktip-sand-100">Export as JSON</button>
                </div>
              )}
            </div>
            <ToolbarSpacer />
            {isOwner && (
              <ToolbarButton
                icon={<Share2 size={14} />}
                label="Invite"
                variant="primary"
                onClick={async () => {
                  if (!wbId) await saveNow()
                  setShareOpen(true)
                }}
                title="Invite collaborators"
              />
            )}
          </Toolbar>
        }
        statusBar={
          <ToolStatusBar
            left={<StatusMetric label="Shapes" value={shapeCount} />}
            right={
              <>
                <SaveIndicator status={status} lastSavedAt={lastSavedAt} />
                <span className="text-ktip-sand-300" aria-hidden>|</span>
                <span className="truncate max-w-[200px]">{wbTitle || 'Whiteboard'}</span>
              </>
            }
          />
        }
      >
        {readyToRender && (
          <TldrawWrapper
            snapshot={initialSnapshot}
            onEditorReady={handleEditorReady}
            readOnly={!canEdit}
          />
        )}
      </ToolPanelShell>

      {/* Close export dropdown on outside click */}
      {exportOpen && <div className="fixed inset-0 z-20" onClick={() => setExportOpen(false)} />}

      <ShareEntityModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        resourceType="whiteboard"
        resourceId={wbId}
        resourceTitle={wbTitle}
      />
    </>
  )
}
