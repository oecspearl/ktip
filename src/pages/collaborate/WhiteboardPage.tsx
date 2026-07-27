import { createSignal, createEffect, createMemo, onCleanup, Show } from 'solid-js'
import { A, useParams, useNavigate } from '@solidjs/router'
import { MainLayout } from '../../components/layout/MainLayout'
import { TldrawWrapper } from '../../components/collaboration/TldrawWrapper'
import { ShareWhiteboardModal } from '../../components/collaboration/ShareWhiteboardModal'
import { useWhiteboard, useWhiteboardPermission, useCreateWhiteboard, useUpdateWhiteboard } from '../../hooks/useWhiteboards'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { ChevronRight, Download, Share2, Save } from 'lucide-solid'

export default function WhiteboardPage() {
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const auth = useAuth()
  const isNew = () => !params.id

  const [editor, setEditor] = createSignal<any>(null)
  const [wbId, setWbId] = createSignal<string | undefined>(params.id)
  const [wbTitle, setWbTitle] = createSignal('Untitled Whiteboard')
  const [saveStatus, setSaveStatus] = createSignal<'saved' | 'saving' | 'unsaved'>('saved')
  const [shareOpen, setShareOpen] = createSignal(false)
  const [snapshotLoaded, setSnapshotLoaded] = createSignal(false)
  const [exportOpen, setExportOpen] = createSignal(false)

  // DB hooks
  const { whiteboard: dbWhiteboard } = useWhiteboard(() => params.id)
  const { permission: sharePermission } = useWhiteboardPermission(() => params.id)
  const { createWhiteboard } = useCreateWhiteboard()
  const { updateWhiteboard } = useUpdateWhiteboard()

  // Check ownership
  const isOwner = createMemo(() => {
    if (isNew()) return true
    const wb = dbWhiteboard()
    const userId = auth.user()?.id
    if (!wb || !userId) return true
    return wb.owner_id === userId
  })

  // Can edit = owner OR shared with edit permission
  const canEdit = createMemo(() => {
    if (isOwner()) return true
    return sharePermission() === 'edit'
  })

  usePageTitle(() => wbTitle() || 'Whiteboard')

  // Load title from DB when whiteboard resolves
  createEffect(() => {
    const wb = dbWhiteboard()
    if (wb && !snapshotLoaded()) {
      setWbTitle(wb.title)
      setWbId(wb.id)
      setSnapshotLoaded(true)
    }
  })

  // Auto-save with debounce
  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined
  let storeCleanup: (() => void) | undefined

  const saveToDb = async () => {
    const ed = editor()
    if (!ed || !canEdit()) return

    setSaveStatus('saving')
    const snapshot = ed.getSnapshot()
    const currentId = wbId()

    try {
      if (currentId) {
        await updateWhiteboard(currentId, { snapshot, title: wbTitle() })
      } else {
        const newWb = await createWhiteboard({ title: wbTitle(), snapshot })
        setWbId(newWb.id)
        navigate(`/collaborate/whiteboard/${newWb.id}`, { replace: true })
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('unsaved')
    }
  }

  const scheduleAutoSave = () => {
    setSaveStatus('unsaved')
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => saveToDb(), 2000)
  }

  const handleEditorReady = (ed: any) => {
    setEditor(ed)
    // Listen for document-level store changes (shapes, pages, styles — not viewport/cursor)
    storeCleanup = ed.store.listen(() => {
      if (canEdit()) {
        scheduleAutoSave()
      }
    }, { scope: 'document' })
  }

  // Fire-and-forget sync for cleanup/beforeunload
  const supabaseSync = (id: string, snapshot: any, title: string) => {
    updateWhiteboard(id, { snapshot, title }).catch(() => {})
  }

  // Cleanup store listener and save pending changes
  onCleanup(() => {
    storeCleanup?.()
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      const currentId = wbId()
      const ed = editor()
      if (currentId && ed) {
        supabaseSync(currentId, ed.getSnapshot(), wbTitle())
      }
    }
  })

  // Save before page unload
  const handleBeforeUnload = () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    const ed = editor()
    const currentId = wbId()
    if (ed && currentId) {
      supabaseSync(currentId, ed.getSnapshot(), wbTitle())
    }
  }

  window.addEventListener('beforeunload', handleBeforeUnload)
  onCleanup(() => window.removeEventListener('beforeunload', handleBeforeUnload))

  // Manual save (Ctrl+S)
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
      saveToDb()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  onCleanup(() => window.removeEventListener('keydown', handleKeyDown))

  // Title save on blur
  const handleTitleBlur = () => {
    const currentId = wbId()
    if (currentId && canEdit()) {
      updateWhiteboard(currentId, { title: wbTitle() }).catch(() => {})
    }
  }

  // Export handlers
  const handleExportPNG = async () => {
    const ed = editor()
    if (!ed) return
    const { exportAs } = await import('tldraw')
    const ids = Array.from(ed.getCurrentPageShapeIds()) as any[]
    if (ids.length === 0) return
    await exportAs(ed, ids, { format: 'png' as any, name: wbTitle() })
    setExportOpen(false)
  }

  const handleExportSVG = async () => {
    const ed = editor()
    if (!ed) return
    const { exportAs } = await import('tldraw')
    const ids = Array.from(ed.getCurrentPageShapeIds()) as any[]
    if (ids.length === 0) return
    await exportAs(ed, ids, { format: 'svg' as any, name: wbTitle() })
    setExportOpen(false)
  }

  const handleExportJSON = () => {
    const ed = editor()
    if (!ed) return
    const snapshot = ed.getSnapshot()
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${wbTitle() || 'whiteboard'}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  // Determine initial snapshot for TldrawWrapper
  const initialSnapshot = createMemo(() => {
    if (isNew()) return null
    const wb = dbWhiteboard()
    return wb?.snapshot || null
  })

  // Wait for DB data before rendering tldraw (for existing whiteboards)
  const readyToRender = createMemo(() => {
    if (isNew()) return true
    return snapshotLoaded()
  })

  return (
    <MainLayout>
      {/* Dark Hero Band */}
      <div class="bg-gray-800 min-h-[140px] flex items-center">
        <div class="max-w-5xl mx-auto px-4 w-full flex items-center justify-between">
          <div class="flex-1 min-w-0">
            <p class="text-gray-400 text-sm uppercase tracking-widest mb-2">Collaboration Tools</p>
            <input
              type="text"
              value={wbTitle()}
              onInput={(e) => setWbTitle(e.currentTarget.value)}
              onBlur={handleTitleBlur}
              readOnly={!canEdit()}
              class="text-3xl md:text-4xl font-display font-bold text-white bg-transparent border-none focus:outline-none w-full placeholder-gray-500"
              placeholder="Untitled Whiteboard"
            />
            <Show when={!isOwner()}>
              <span class={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-medium border ${
                canEdit()
                  ? 'bg-ktip-ocean-500/20 text-ktip-ocean-300 border-ktip-ocean-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {canEdit() ? 'Editor — Shared with you' : 'View Only — Shared with you'}
              </span>
            </Show>
          </div>
          <nav class="hidden md:flex items-center gap-1 text-sm text-gray-400 shrink-0 ml-4">
            <A href="/" class="hover:text-white transition-colors">Home</A>
            <ChevronRight size={14} />
            <A href="/collaborate" class="hover:text-white transition-colors">Collaborate</A>
            <ChevronRight size={14} />
            <A href="/collaborate/whiteboards" class="hover:text-white transition-colors">Whiteboards</A>
            <ChevronRight size={14} />
            <span class="text-gray-200 truncate max-w-[150px]">{wbTitle()}</span>
          </nav>
        </div>
      </div>

      {/* Action Toolbar */}
      <div class="bg-white border-b border-ktip-sand-200">
        <div class="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class={`text-xs px-2 py-1 rounded ${
              saveStatus() === 'saved' ? 'text-green-600 bg-green-50' :
              saveStatus() === 'saving' ? 'text-amber-600 bg-amber-50' :
              'text-red-600 bg-red-50'
            }`}>
              {saveStatus() === 'saved' ? 'Saved' :
               saveStatus() === 'saving' ? 'Saving...' : 'Unsaved'}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <Show when={canEdit()}>
              <button
                type="button"
                onClick={() => { if (autoSaveTimer) clearTimeout(autoSaveTimer); saveToDb() }}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-ktip-sand-600 hover:bg-ktip-sand-50 rounded-lg transition-colors"
              >
                <Save size={14} />
                Save
              </button>
            </Show>
            {/* Export dropdown */}
            <div class="relative">
              <button
                type="button"
                onClick={() => setExportOpen(!exportOpen())}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-ktip-sand-600 hover:bg-ktip-sand-50 rounded-lg transition-colors"
              >
                <Download size={14} />
                Export
              </button>
              <Show when={exportOpen()}>
                <div class="absolute right-0 top-full mt-1 w-40 bg-white border border-ktip-sand-200 rounded-lg shadow-medium z-20">
                  <button type="button" onClick={handleExportPNG} class="w-full text-left px-3 py-2 text-sm hover:bg-ktip-sand-50 rounded-t-lg">Export as PNG</button>
                  <button type="button" onClick={handleExportSVG} class="w-full text-left px-3 py-2 text-sm hover:bg-ktip-sand-50">Export as SVG</button>
                  <button type="button" onClick={handleExportJSON} class="w-full text-left px-3 py-2 text-sm hover:bg-ktip-sand-50 rounded-b-lg">Export as JSON</button>
                </div>
              </Show>
            </div>
            <Show when={isOwner()}>
              <button
                type="button"
                onClick={async () => {
                  if (!wbId()) {
                    if (autoSaveTimer) clearTimeout(autoSaveTimer)
                    await saveToDb()
                  }
                  setShareOpen(true)
                }}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-ktip-ocean-600 hover:bg-ktip-ocean-700 text-white rounded-lg transition-colors"
              >
                <Share2 size={14} />
                Share
              </button>
            </Show>
          </div>
        </div>
      </div>

      {/* Whiteboard not found */}
      <Show when={!isNew() && dbWhiteboard.error}>
        <div class="bg-white py-16 text-center">
          <h2 class="text-xl font-semibold text-ktip-sand-800 mb-2">Whiteboard not found</h2>
          <p class="text-ktip-sand-500 mb-4">This whiteboard may have been deleted or you don't have access.</p>
          <A href="/collaborate/whiteboards" class="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium">
            Back to My Whiteboards
          </A>
        </div>
      </Show>

      {/* Whiteboard Canvas */}
      <Show when={readyToRender() && (isNew() || !dbWhiteboard.error)}>
        <div class="bg-white py-4">
          <div class="max-w-5xl mx-auto px-4">
            <TldrawWrapper
              snapshot={initialSnapshot()}
              onEditorReady={handleEditorReady}
              readOnly={!canEdit()}
            />
          </div>
        </div>
      </Show>

      {/* Close export dropdown on outside click */}
      <Show when={exportOpen()}>
        <div class="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
      </Show>

      {/* Share Modal */}
      <ShareWhiteboardModal
        open={shareOpen()}
        onClose={() => setShareOpen(false)}
        whiteboardId={() => wbId()}
        whiteboardTitle={() => wbTitle()}
      />
    </MainLayout>
  )
}
