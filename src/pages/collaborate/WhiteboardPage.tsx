import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import { TldrawWrapper } from '../../components/collaboration/TldrawWrapper'
import { ShareWhiteboardModal } from '../../components/collaboration/ShareWhiteboardModal'
import { useWhiteboard, useWhiteboardPermission, useCreateWhiteboard, useUpdateWhiteboard } from '../../hooks/useWhiteboards'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Download, Share2, Save } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { truncate } from '../../lib/utils'

export default function WhiteboardPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const isNew = !params.id

  const [editor, setEditor] = useState<any>(null)
  const [wbId, setWbId] = useState<string | undefined>(params.id)
  const [wbTitle, setWbTitle] = useState('Untitled Whiteboard')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [shareOpen, setShareOpen] = useState(false)
  const [snapshotLoaded, setSnapshotLoaded] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

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

  // --- Refs that mirror the latest render's values, used by long-lived
  // listeners/timers (tldraw store subscription, beforeunload, unmount
  // cleanup) that would otherwise close over stale state. ---
  const editorRef = useRef<any>(null)
  const wbIdRef = useRef(wbId)
  const wbTitleRef = useRef(wbTitle)
  const canEditRef = useRef(canEdit)
  const updateWhiteboardRef = useRef(updateWhiteboard)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const storeCleanupRef = useRef<(() => void) | undefined>(undefined)

  wbIdRef.current = wbId
  wbTitleRef.current = wbTitle
  canEditRef.current = canEdit
  updateWhiteboardRef.current = updateWhiteboard

  const saveToDb = async () => {
    const ed = editorRef.current
    if (!ed || !canEditRef.current) return

    setSaveStatus('saving')
    const snapshot = ed.getSnapshot()
    const currentId = wbIdRef.current

    try {
      if (currentId) {
        await updateWhiteboard(currentId, { snapshot, title: wbTitleRef.current })
      } else {
        const newWb = await createWhiteboard({ title: wbTitleRef.current, snapshot })
        setWbId(newWb.id)
        wbIdRef.current = newWb.id
        navigate(`/collaborate/whiteboard/${newWb.id}`, { replace: true })
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('unsaved')
    }
  }
  const saveToDbRef = useRef(saveToDb)
  saveToDbRef.current = saveToDb

  const scheduleAutoSave = () => {
    setSaveStatus('unsaved')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => saveToDbRef.current(), 2000)
  }
  const scheduleAutoSaveRef = useRef(scheduleAutoSave)
  scheduleAutoSaveRef.current = scheduleAutoSave

  const handleEditorReady = (ed: any) => {
    setEditor(ed)
    editorRef.current = ed
    // Listen for document-level store changes (shapes, pages, styles — not viewport/cursor)
    storeCleanupRef.current = ed.store.listen(
      () => {
        if (canEditRef.current) {
          scheduleAutoSaveRef.current()
        }
      },
      { scope: 'document' }
    )
  }

  // Cleanup store listener and save pending changes on unmount
  useEffect(() => {
    return () => {
      storeCleanupRef.current?.()
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        const currentId = wbIdRef.current
        const ed = editorRef.current
        if (currentId && ed) {
          updateWhiteboardRef.current(currentId, { snapshot: ed.getSnapshot(), title: wbTitleRef.current }).catch(() => {})
        }
      }
    }
  }, [])

  // Save before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      const ed = editorRef.current
      const currentId = wbIdRef.current
      if (ed && currentId) {
        updateWhiteboardRef.current(currentId, { snapshot: ed.getSnapshot(), title: wbTitleRef.current }).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Manual save (Ctrl+S)
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

  // Title save on blur
  const handleTitleBlur = () => {
    if (wbId && canEdit) {
      updateWhiteboard(wbId, { title: wbTitle }).catch(() => {})
    }
  }

  // Export handlers
  const handleExportPNG = async () => {
    const ed = editor
    if (!ed) return
    const { exportAs } = await import('tldraw')
    const ids = Array.from(ed.getCurrentPageShapeIds()) as any[]
    if (ids.length === 0) return
    await exportAs(ed, ids, { format: 'png' as any, name: wbTitle })
    setExportOpen(false)
  }

  const handleExportSVG = async () => {
    const ed = editor
    if (!ed) return
    const { exportAs } = await import('tldraw')
    const ids = Array.from(ed.getCurrentPageShapeIds()) as any[]
    if (ids.length === 0) return
    await exportAs(ed, ids, { format: 'svg' as any, name: wbTitle })
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

  return (
    <>
      <PageHero
        eyebrow="Collaboration Tools"
        title={
          <input
            type="text"
            value={wbTitle}
            onChange={(e) => setWbTitle(e.target.value)}
            onBlur={handleTitleBlur}
            readOnly={!canEdit}
            className="font-display font-bold text-white bg-transparent border-none focus:outline-none w-full placeholder-gray-500"
            placeholder="Untitled Whiteboard"
          />
        }
        imageSeed="whiteboards"
        compact
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Collaborate', href: '/collaborate' },
          { label: 'Whiteboards', href: '/collaborate/whiteboards' },
          { label: truncate(wbTitle, 20) },
        ]}
      >
        {!isOwner && (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
            canEdit
              ? 'bg-ktip-ocean-500/20 text-ktip-ocean-300 border-ktip-ocean-500/30'
              : 'bg-ktip-sun-500/20 text-ktip-sun-300 border-ktip-sun-500/30'
          }`}>
            {canEdit ? 'Editor — Shared with you' : 'View Only — Shared with you'}
          </span>
        )}
      </PageHero>

      {/* Action Toolbar */}
      <div className="bg-white border-b border-ktip-sand-200">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded ${
              saveStatus === 'saved' ? 'text-ktip-tropical-700 bg-ktip-tropical-50' :
              saveStatus === 'saving' ? 'text-ktip-sun-600 bg-ktip-sun-50' :
              'text-red-600 bg-red-50'
            }`}>
              {saveStatus === 'saved' ? 'Saved' :
               saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); saveToDb() }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-ktip-sand-600 hover:bg-ktip-sand-50 rounded-lg transition-colors"
              >
                <Save size={14} />
                Save
              </button>
            )}
            {/* Export dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen(!exportOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-ktip-sand-600 hover:bg-ktip-sand-50 rounded-lg transition-colors"
              >
                <Download size={14} />
                Export
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-ktip-sand-200 rounded-lg shadow-medium z-20">
                  <button type="button" onClick={handleExportPNG} className="w-full text-left px-3 py-2 text-sm hover:bg-ktip-sand-50 rounded-t-lg">Export as PNG</button>
                  <button type="button" onClick={handleExportSVG} className="w-full text-left px-3 py-2 text-sm hover:bg-ktip-sand-50">Export as SVG</button>
                  <button type="button" onClick={handleExportJSON} className="w-full text-left px-3 py-2 text-sm hover:bg-ktip-sand-50 rounded-b-lg">Export as JSON</button>
                </div>
              )}
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={async () => {
                  if (!wbId) {
                    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
                    await saveToDb()
                  }
                  setShareOpen(true)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-ktip-ocean-600 hover:bg-ktip-ocean-700 text-white rounded-lg transition-colors"
              >
                <Share2 size={14} />
                Share
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Whiteboard not found */}
      {!isNew && dbWhiteboardError && (
        <div className="bg-white py-16 text-center">
          <h2 className="text-xl font-semibold text-ktip-sand-800 mb-2">Whiteboard not found</h2>
          <p className="text-ktip-sand-500 mb-4">This whiteboard may have been deleted or you don't have access.</p>
          <Link to="/collaborate/whiteboards" className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium">
            Back to My Whiteboards
          </Link>
        </div>
      )}

      {/* Whiteboard Canvas */}
      {readyToRender && (isNew || !dbWhiteboardError) && (
        <div className="bg-white py-4">
          <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
            <TldrawWrapper
              snapshot={initialSnapshot}
              onEditorReady={handleEditorReady}
              readOnly={!canEdit}
            />
          </div>
        </div>
      )}

      {/* Close export dropdown on outside click */}
      {exportOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
      )}

      {/* Share Modal */}
      <ShareWhiteboardModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        whiteboardId={wbId}
        whiteboardTitle={wbTitle}
      />
    </>
  )
}
