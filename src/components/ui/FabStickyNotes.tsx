import { Suspense } from 'react'
import { StickyNote } from 'lucide-react'
import { useStickyNotesPanel } from '../../contexts/StickyNotesContext'
import { GhostOpacityControl } from './GhostOpacityControl'
import type { FabAction } from './FabCluster'
import { lazyOverlay } from '../../lib/lazy-overlay'
import { useLingui } from '@lingui/react/macro'

// Both lazy: someone who never opens a note should not pay for the editor, the
// folder graphics or the drag handling in the entry chunk. lazyOverlay rather
// than lazy, for the reason MainLayout gives — a chunk that does not arrive
// must cost the reader the notes, not the site.
const StickyNoteFabPanel = lazyOverlay(
  () => import('../notes/StickyNoteFabPanel').then((m) => ({ default: m.StickyNoteFabPanel })),
  'sticky-notes-panel'
)
const StickyNoteOverlay = lazyOverlay(
  () => import('../notes/StickyNoteOverlay').then((m) => ({ default: m.StickyNoteOverlay })),
  'sticky-notes'
)

/**
 * The sticky-note half of the dock: the saved-notes panel and the layer that
 * draws every note on screen, ghost mode included.
 *
 * Ghost mode comes from the notes themselves — a pinned note calls
 * `useGhostMode`, fades to the shared opacity preference and goes
 * click-through until the cursor approaches it. The preference is edited from
 * `GhostOpacityControl`, which each note carries in its own toolbar; render
 * `<StickyNoteGhostControl />` below to offer it from the dock as well.
 *
 * Both children portal to `document.body`, so this mounts anywhere inside a
 * `StickyNotesProvider` — including inside the FAB's `em`-scaled cluster,
 * whose font size they will not inherit.
 *
 * Mount exactly once. Two instances would draw every note twice.
 */
export function FabStickyNotes() {
  const { fabPanelOpen } = useStickyNotesPanel()

  return (
    <Suspense fallback={null}>
      {fabPanelOpen && <StickyNoteFabPanel />}
      <StickyNoteOverlay />
    </Suspense>
  )
}

/**
 * The dock's sticky-note button.
 *
 * Opens the saved-notes panel rather than dropping a note straight onto the
 * page: that panel is also the only route back to a note that was closed.
 * The badge counts every note that exists, not just the ones on screen.
 */
export function useStickyNoteFabAction({
  iconSize = 23,
  onActivate,
}: { iconSize?: number; onActivate?: () => void } = {}): FabAction {
  const { t } = useLingui()
  const { notes, fabPanelOpen, setFabPanelOpen } = useStickyNotesPanel()

  return {
    id: 'note',
    label: t`Sticky notes`,
    icon: <StickyNote size={iconSize} />,
    tone: 'yellow',
    onClick: () => {
      setFabPanelOpen(!fabPanelOpen)
      onActivate?.()
    },
    badge: notes.length > 0,
    count: notes.length,
  }
}

/** Ghost-mode settings, for a dock panel that wants to offer them alongside
 *  the notes rather than only from inside a note's toolbar. */
export function StickyNoteGhostControl({ className }: { className?: string }) {
  return <GhostOpacityControl className={className} />
}