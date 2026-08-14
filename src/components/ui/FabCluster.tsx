import { lazy, Suspense, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '../../lib/utils'

// Opt-in, and lazy on top of that: a cluster without `stickyNotes` never loads
// the notes module, and one with it does not pay for the editor up front.
const FabStickyNotes = lazy(() =>
  import('./FabStickyNotes').then((m) => ({ default: m.FabStickyNotes }))
)

/**
 * Per-action colour. Every option being the same pale card makes a cluster read
 * as one undifferentiated blob; a saturated fill per action is what makes "the
 * green one" a thing you can aim for.
 *
 * Literal hex applied inline, not Tailwind classes: `html.dark` re-points the
 * whole palette, and these buttons are deliberately the one thing on the page
 * that looks identical in both themes. A quick-action you reach for by colour
 * cannot change colour at dusk.
 */
export const FAB_TONES = {
  blue: ['#4f8ef7', '#2563eb'],
  amber: ['#fbbf24', '#f59e0b'],
  red: ['#f87171', '#ef4444'],
  yellow: ['#facc15', '#eab308'],
  green: ['#34d399', '#10b981'],
  violet: ['#a78bfa', '#7c3aed'],
} as const

export type FabTone = keyof typeof FAB_TONES

export function fabFill(tone: FabTone): string {
  const [from, to] = FAB_TONES[tone]
  return `linear-gradient(150deg, ${from}, ${to})`
}

export interface FabAction {
  id: string
  /** Tooltip text and `aria-label` — already translated by the caller */
  label: string
  icon: ReactNode
  tone: FabTone
  onClick: () => void
  /** Omit or pass true to render; false drops the action from the column */
  show?: boolean
  /** Pulsing dot — "there is something here you haven't done yet" */
  badge?: boolean
  /** Number on the dot, when a count is more useful than a "something" */
  count?: number
}

export interface FabTriggerState {
  open: boolean
  /**
   * True while open AND for the whole collapse. The trigger is the lid of the
   * cluster: it must hold its open face until the last button has landed.
   */
  showClose: boolean
  toggle: () => void
  /** Attach to the trigger element — the cluster measures/anchors from it */
  ref: RefObject<HTMLButtonElement | null>
  /** Authored px → scaled px, for icon `size` props inside the trigger */
  px: (n: number) => number
}

type FabCorner = 'bottom-right' | 'bottom-left'

export interface FabClusterProps {
  /** On-screen order, nearest the trigger first */
  actions: FabAction[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The always-visible tile. Gets `toggle`, `ref` and the open/closing state. */
  renderTrigger: (state: FabTriggerState) => ReactNode
  /**
   * Anything anchored above the cluster (a settings panel). Rendered inside the
   * outside-click boundary, so interacting with it does not close the cluster.
   */
  panel?: ReactNode
  /**
   * Escape backs out one level at a time. Return true to consume the key (a
   * sub-panel closed); the cluster closes itself only when nothing consumed it.
   * Same contract for an outside click.
   */
  onDismiss?: () => boolean
  corner?: FabCorner
  /** The em basis: every length inside the cluster is authored against 16px */
  scale?: number
  /**
   * Mount the sticky-note surface with the cluster: the saved-notes panel and
   * the on-screen note layer, ghost mode included. Requires a
   * `StickyNotesProvider` above; pair it with `useStickyNoteFabAction()` from
   * `./FabStickyNotes` for the button that opens the panel.
   */
  stickyNotes?: boolean
  className?: string
}

const CORNER: Record<FabCorner, { container: string; tooltip: string }> = {
  'bottom-right': {
    container: 'right-[1.5em]',
    tooltip: 'right-full mr-[0.75em]',
  },
  'bottom-left': {
    container: 'left-[1.5em]',
    tooltip: 'left-full ml-[0.75em]',
  },
}

/**
 * Expandable quick-actions cluster fixed to a bottom corner.
 *
 * Collapsed: the caller's trigger alone. Expanded: the actions fan out from it
 * with a staggered spring and fall back on a gravity curve. This component owns
 * the corner, the motion, the outside-click/Escape dismissal and the badges;
 * the caller owns what the actions ARE and what the trigger looks like.
 *
 * Sizing: every length is `em` against `16 * scale` on the root, so the cluster
 * holds its authored proportions on any display. Pass `scale` from
 * `useViewportScale` for a cluster that must fit a short viewport.
 *
 * Note that only one cluster should be mounted per corner — `[data-fab]` is
 * also what screen capture hides and what reduced-motion targets.
 */
export function FabCluster({
  actions,
  open,
  onOpenChange,
  renderTrigger,
  panel,
  onDismiss,
  corner = 'bottom-right',
  scale = 1,
  stickyNotes = false,
  className,
}: FabClusterProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const px = (n: number) => Math.round(n * scale)

  const visible = actions.filter((a) => a.show !== false)

  // Latest handlers without re-binding the document listeners every render
  const dismissRef = useRef(onDismiss)
  const openChangeRef = useRef(onOpenChange)
  useEffect(() => {
    dismissRef.current = onDismiss
    openChangeRef.current = onOpenChange
  })

  useEffect(() => {
    if (!open) return
    const close = () => {
      if (dismissRef.current?.()) return
      openChangeRef.current(false)
    }
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // An outside click dismisses the whole thing, sub-panel included
        dismissRef.current?.()
        openChangeRef.current(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // How long the fall actually takes: the last button's stagger delay plus its
  // own transform. Must track the transitionDelay/transition on the buttons.
  const collapseMs = Math.max(visible.length - 1, 0) * 50 + 340

  // Letting the trigger flip the instant `open` goes false puts its collapsed
  // face back on screen while buttons are still visibly falling past it.
  const [collapsing, setCollapsing] = useState(false)
  const wasOpen = useRef(open)
  useEffect(() => {
    const closing = wasOpen.current && !open
    wasOpen.current = open
    if (open) {
      setCollapsing(false)
      return
    }
    if (!closing) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    setCollapsing(true)
  }, [open])

  // The reset timer lives in its own effect, keyed on `collapsing` itself.
  // Shared with the effect above, any dependency change mid-collapse — a
  // navigation changes `visible.length` and with it `collapseMs` — ran the
  // cleanup, cleared the pending timeout, and the re-run took the not-closing
  // early return without ever rescheduling: `collapsing` stayed true and the
  // trigger was stuck on its open face until the next full open/close cycle.
  useEffect(() => {
    if (!collapsing || open) return
    const t = setTimeout(() => setCollapsing(false), collapseMs)
    return () => clearTimeout(t)
  }, [collapsing, open, collapseMs])

  const showClose = open || collapsing

  return (
    <>
    <div
      ref={containerRef}
      data-fab
      className={cn(
        'fixed bottom-[1.5em] z-fab flex flex-col items-center gap-[0.75em]',
        CORNER[corner].container,
        className
      )}
      style={{ fontSize: `${16 * scale}px` }}
    >
      {panel}

      {visible.map((action, index) => (
        <button
          key={action.id}
          onClick={action.onClick}
          aria-label={action.label}
          tabIndex={open ? 0 : -1}
          className={cn(
            'relative group w-[4em] h-[4em] rounded-[1.25em] flex items-center justify-center',
            'text-white shadow-fab hover:shadow-fab-hover hover:scale-105 hover:-translate-y-0.5',
            open ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 pointer-events-none'
          )}
          style={{
            background: fabFill(action.tone),
            // Direction-dependent, so it cannot live in a class: the buttons
            // POP OUT from small, but they must not shrink on the way back —
            // a falling object does not get further away. Falling is a drop
            // and a fade at full size; only the resting state below the
            // trigger, which nobody sees, is scaled down ready to pop again.
            // Left undefined while open so the hover lift still applies.
            transform: open
              ? undefined
              : collapsing
                ? 'translateY(1.25em)'
                : 'translateY(1.25em) scale(0.75)',
            // Two different motions, not one played backwards. Out: a spring
            // up from the trigger, nearest button first. In: gravity — each
            // button drops back into the cluster on an ease-IN curve, top of
            // the column first, so the stack visibly folds down instead of
            // every button blinking out at once.
            transition: open
              ? 'transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease, box-shadow 0.35s cubic-bezier(0.22,1,0.36,1)'
              : 'transform 0.34s cubic-bezier(0.5,0,0.9,0.4), opacity 0.2s ease-in, box-shadow 0.2s ease',
            // Per-property, in the same order as the transition above: on the
            // way in the fade trails the fall, so you see the button drop
            // rather than watching it dissolve in place.
            transitionDelay: open
              ? `${0.03 + (visible.length - 1 - index) * 0.06}s`
              : `${index * 0.05}s, ${index * 0.05 + 0.09}s, ${index * 0.05}s`,
          }}
        >
          {action.icon}
          {action.badge &&
            (action.count && action.count > 0 ? (
              // Sized to be read at a glance from across the corner rather
              // than inspected: the count is the whole reason the action is
              // worth pressing. The ring keeps it legible against whichever
              // saturated tone the button underneath happens to be.
              <span className="absolute -top-[0.375em] -right-[0.375em] min-w-[1.6em] h-[1.6em] px-[0.35em] rounded-full bg-red-500 text-white text-[0.875em] font-bold tabular-nums leading-none flex items-center justify-center shadow-sm ring-2 ring-white/90">
                {action.count > 99 ? '99+' : action.count}
              </span>
            ) : (
              // Concentric with the count badge, not the same size as it: a dot
              // carries no digits, so at the badge's diameter it read as a blob
              // sitting on the icon. Half the width, offset so the centre stays
              // put — a dot that moved once a count arrived would read as two
              // different signals.
              <span className="absolute top-0 right-0 w-[0.85em] h-[0.85em] rounded-full bg-red-500 shadow-sm ring-2 ring-white/90 animate-pulse-soft" />
            ))}
          {/* text-[0.75em] resets the em basis for this element, so its own
              padding is divided by 0.75 to land back on the authored 10px/6px */}
          <span
            className={cn(
              'absolute top-1/2 -translate-y-1/2 whitespace-nowrap px-[0.833em] py-[0.5em] rounded-[0.667em]',
              'bg-ktip-ink text-white text-[0.75em] font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity',
              CORNER[corner].tooltip
            )}
          >
            {action.label}
          </span>
        </button>
      ))}

      {renderTrigger({
        open,
        showClose,
        toggle: () => onOpenChange(!open),
        ref: triggerRef,
        px,
      })}
    </div>

    {/* Outside the cluster: the note layer portals itself and must not inherit
        the cluster's em basis, which would scale every note with it. */}
    {stickyNotes && (
      <Suspense fallback={null}>
        <FabStickyNotes />
      </Suspense>
    )}
    </>
  )
}