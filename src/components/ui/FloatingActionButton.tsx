import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import {
  Accessibility,
  GraduationCap,
  Megaphone,
  MessageSquare,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  StickyNote,
  Sun,
  SunMedium,
  Type,
  X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { useStickyNotesPanel } from '../../contexts/StickyNotesContext'
import { useTutorials } from '../../contexts/TutorialContext'
import { useUnreadMessageCount } from '../../hooks/useMessages'
import { tutorialIdForPath } from '../../data/tutorials'
import { useThemeMode } from '../../hooks/useThemeMode'
import {
  A11Y_DEFAULTS,
  A11Y_RANGE,
  useAccessibilityPrefs,
} from '../../hooks/useAccessibilityPrefs'
import { useViewportScale } from '../../hooks/useViewportScale'
import { cn } from '../../lib/utils'

// The feedback modal is a canvas annotator behind a button almost nobody
// presses on any given page — it has no business in the entry chunk.
const FeedbackModal = lazy(() =>
  import('../feedback/FeedbackModal').then((m) => ({ default: m.FeedbackModal }))
)
const StickyNoteFabPanel = lazy(() =>
  import('../notes/StickyNoteFabPanel').then((m) => ({ default: m.StickyNoteFabPanel }))
)

// Authored against the same 2000px-wide reference viewport as the hero. Height
// matters now that six options stack: the expanded column is ~28em tall, which
// overflows a short laptop viewport unless the cluster shrinks with it.
// Floor of 0.8 keeps the trigger at 58px, above the 44px minimum touch target.
const FAB_DESIGN = { width: 2000, height: 900, min: 0.8, max: 1 }

/**
 * Per-action colour. Every option used to be the same grey-on-cream card,
 * which made the cluster read as one undifferentiated blob; a saturated fill
 * per action is what makes "the green one" a thing you can aim for.
 *
 * Literal hex applied inline, not Tailwind classes: `html.dark` re-points the
 * whole palette, and these buttons are deliberately the one thing on the page
 * that looks identical in both themes. A quick-action you reach for by colour
 * cannot change colour at dusk.
 */
const TONES = {
  blue: ['#4f8ef7', '#2563eb'],
  amber: ['#fbbf24', '#f59e0b'],
  red: ['#f87171', '#ef4444'],
  yellow: ['#facc15', '#eab308'],
  green: ['#34d399', '#10b981'],
  violet: ['#a78bfa', '#7c3aed'],
} as const

type FabTone = keyof typeof TONES

function fill(tone: FabTone): string {
  const [from, to] = TONES[tone]
  return `linear-gradient(150deg, ${from}, ${to})`
}

interface FabAction {
  id: string
  label: string
  icon: ReactNode
  tone: FabTone
  onClick: () => void
  show?: boolean
  /** Pulsing dot — "there is something here you haven't done yet" */
  badge?: boolean
  /** Number on the dot, when a count is more useful than a "something" */
  count?: number
}

interface NumberStepperProps {
  icon: ReactNode
  label: string
  value: string
  onDecrease: () => void
  onIncrease: () => void
  atMin: boolean
  atMax: boolean
  /** px size for the +/− glyphs, scaled by the caller off the FAB factor */
  iconSize: number
}

/** One labelled −/value/+ row in the accessibility panel. Not a progress
 *  stepper — that one lives in `ui/Stepper.tsx`. */
function NumberStepper({
  icon,
  label,
  value,
  onDecrease,
  onIncrease,
  atMin,
  atMax,
  iconSize,
}: NumberStepperProps) {
  const button =
    'w-[1.75em] h-[1.75em] rounded-[0.375em] flex items-center justify-center border border-ktip-sand-200 text-ktip-sand-700 hover:bg-ktip-sand-50 hover:text-ktip-ocean-600 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ktip-sand-700 transition-colors'

  return (
    <div className="mt-[0.75em] first:mt-0">
      <div className="flex items-center gap-[0.375em] text-[0.75em] text-ktip-sand-600 mb-[0.375em]">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-[0.5em]">
        <button onClick={onDecrease} disabled={atMin} aria-label={`Decrease ${label}`} className={button}>
          <Minus size={iconSize} />
        </button>
        {/* tabular-nums so the row does not reflow as the number changes */}
        <span className="flex-1 text-center text-[0.8125em] font-medium tabular-nums text-ktip-sand-900">
          {value}
        </span>
        <button onClick={onIncrease} disabled={atMax} aria-label={`Increase ${label}`} className={button}>
          <Plus size={iconSize} />
        </button>
      </div>
    </div>
  )
}

/**
 * Expandable quick-actions cluster fixed to the bottom-right corner.
 * Collapsed: single round button with the KTIP logo. Expanded: sub-buttons
 * fan upward with a staggered spring; the main button turns grey with an X.
 * Add future actions by appending to the `actions` array below — each needs a
 * `tone`, and the array order is the on-screen order, so keep two warm hues
 * from ending up adjacent.
 * Note: this corner is also reserved by the (currently unmounted)
 * UATFeedbackButton and the older feedback/FeedbackButton pill — this cluster
 * is now the single entry point for both, so neither should be mounted.
 */
export function FloatingActionButton() {
  const auth = useAuth()
  const { togglePanel } = useMessagingPanel()
  const { notes, fabPanelOpen, setFabPanelOpen } = useStickyNotesPanel()
  const { startTutorial, isTutorialCompleted } = useTutorials()
  const { unreadCount } = useUnreadMessageCount(auth.user?.id)
  const { pathname } = useLocation()
  const [dark, setDark] = useThemeMode()
  const [a11y, setA11y] = useAccessibilityPrefs()
  const [open, setOpen] = useState(false)
  const [a11yOpen, setA11yOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // Every length below is `em` against this, so the cluster keeps its authored
  // proportions instead of looking oversized on a smaller CSS viewport
  const scale = useViewportScale(FAB_DESIGN)
  const px = (n: number) => Math.round(n * scale)

  // Only pages with a registered walkthrough show the graduation-cap action
  const pageTutorialId = tutorialIdForPath(pathname)
  const noteCount = notes.length

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setA11yOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape backs out one level at a time: panel first, then the cluster
      if (a11yOpen) setA11yOpen(false)
      else setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, a11yOpen])

  const actions: FabAction[] = [
    {
      id: 'note',
      label: 'Sticky notes',
      icon: <StickyNote size={px(23)} />,
      tone: 'yellow',
      // Opens the panel rather than dropping a note straight onto the page:
      // the panel is also the only route back to a note that was closed.
      onClick: () => {
        setFabPanelOpen(!fabPanelOpen)
        setOpen(false)
      },
      badge: noteCount > 0,
      count: noteCount,
    },
    {
      id: 'accessibility',
      label: 'Accessibility',
      icon: <Accessibility size={px(23)} />,
      tone: 'blue',
      // Opens a panel rather than acting directly, so the cluster stays open
      onClick: () => setA11yOpen((v) => !v),
    },
    {
      id: 'feedback',
      label: 'Feedback',
      icon: <Megaphone size={px(23)} />,
      tone: 'red',
      onClick: () => {
        setFeedbackOpen(true)
        setOpen(false)
      },
    },
    {
      id: 'tutorial',
      label: 'Page tour',
      icon: <GraduationCap size={px(23)} />,
      tone: 'green',
      onClick: () => {
        if (pageTutorialId) startTutorial(pageTutorialId)
        setOpen(false)
      },
      show: !!pageTutorialId,
      badge: !!pageTutorialId && !isTutorialCompleted(pageTutorialId),
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: <MessageSquare size={px(23)} />,
      tone: 'violet',
      onClick: () => {
        togglePanel()
        setOpen(false)
      },
      show: !!auth.user,
      badge: unreadCount > 0,
      count: unreadCount,
    },
    {
      id: 'theme',
      label: dark ? 'Light mode' : 'Dark mode',
      icon: dark ? <Sun size={px(23)} /> : <Moon size={px(23)} />,
      tone: 'amber',
      // Stays open so the flip is visible
      onClick: () => setDark(!dark),
    },
  ]

  const visible = actions.filter((a) => a.show !== false)
  // Surfaced on the collapsed trigger too — a dot only on the fanned-out
  // sub-button would never be seen by the person who most needs the tour
  const hasUnseen = visible.some((a) => a.badge)

  const atDefaults =
    a11y.fontScale === A11Y_DEFAULTS.fontScale && a11y.brightness === A11Y_DEFAULTS.brightness

  return (
    <>
    <div
      ref={containerRef}
      data-fab
      className="fixed bottom-[1.5em] right-[1.5em] z-[9999] flex flex-col items-center gap-[0.75em]"
      style={{ fontSize: `${16 * scale}px` }}
    >
      {/* Accessibility panel — anchored above the cluster, inside containerRef
          so the outside-click handler treats it as part of the FAB */}
      {open && a11yOpen && (
        <div
          role="group"
          aria-label="Accessibility settings"
          className="absolute bottom-full right-0 mb-[0.75em] w-[15em] rounded-[0.75em] border border-ktip-sand-200 bg-ktip-cream p-[1em] shadow-fab-hover animate-slide-up"
        >
          <div className="flex items-center justify-between mb-[0.75em]">
            <p className="text-[0.8125em] font-semibold text-ktip-sand-900">Accessibility</p>
            <button
              onClick={() => setA11y(A11Y_DEFAULTS)}
              disabled={atDefaults}
              className="flex items-center gap-[0.25em] text-[0.6875em] text-ktip-sand-500 hover:text-ktip-ocean-600 disabled:opacity-40 disabled:hover:text-ktip-sand-500 transition-colors"
            >
              <RotateCcw size={px(11)} />
              Reset
            </button>
          </div>

          <NumberStepper
            icon={<Type size={px(14)} />}
            label="Text size"
            value={`${Math.round(a11y.fontScale * 100)}%`}
            onDecrease={() => setA11y({ fontScale: a11y.fontScale - A11Y_RANGE.fontScale.step })}
            onIncrease={() => setA11y({ fontScale: a11y.fontScale + A11Y_RANGE.fontScale.step })}
            atMin={a11y.fontScale <= A11Y_RANGE.fontScale.min}
            atMax={a11y.fontScale >= A11Y_RANGE.fontScale.max}
            iconSize={px(13)}
          />

          <NumberStepper
            icon={<SunMedium size={px(14)} />}
            label="Photo brightness"
            value={`${Math.round(a11y.brightness * 100)}%`}
            onDecrease={() => setA11y({ brightness: a11y.brightness - A11Y_RANGE.brightness.step })}
            onIncrease={() => setA11y({ brightness: a11y.brightness + A11Y_RANGE.brightness.step })}
            atMin={a11y.brightness <= A11Y_RANGE.brightness.min}
            atMax={a11y.brightness >= A11Y_RANGE.brightness.max}
            iconSize={px(13)}
          />
        </div>
      )}

      {visible.map((action, index) => (
        <button
          key={action.id}
          onClick={action.onClick}
          aria-label={action.label}
          tabIndex={open ? 0 : -1}
          className={cn(
            'relative group w-[4em] h-[4em] rounded-[1.25em] flex items-center justify-center',
            'text-white shadow-fab hover:shadow-fab-hover hover:scale-105 hover:-translate-y-0.5',
            open
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-4 scale-75 pointer-events-none'
          )}
          style={{
            background: fill(action.tone),
            transition:
              'transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease, box-shadow 0.35s cubic-bezier(0.22,1,0.36,1)',
            transitionDelay: open ? `${0.03 + (visible.length - 1 - index) * 0.06}s` : '0s',
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
              <span className="absolute top-[0.5em] right-[0.5em] w-[0.5em] h-[0.5em] rounded-full bg-red-500 animate-pulse-soft" />
            ))}
          {/* text-[0.75em] resets the em basis for this element, so its own
              padding is divided by 0.75 to land back on the authored 10px/6px */}
          <span className="absolute right-full mr-[0.75em] top-1/2 -translate-y-1/2 whitespace-nowrap px-[0.833em] py-[0.5em] rounded-[0.667em] bg-ktip-ink text-white text-[0.75em] font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
            {action.label}
          </span>
        </button>
      ))}

      <button
        onClick={() => setOpen(!open)}
        aria-label="Quick actions"
        aria-expanded={open}
        className={cn(
          'relative w-[4.5em] h-[4.5em] rounded-[1.375em] flex items-center justify-center shadow-fab',
          'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          open
            ? 'text-white shadow-fab-hover'
            : 'bg-ktip-cream border border-ktip-sand-200 hover:scale-105 hover:-translate-y-0.5 hover:shadow-fab-hover'
        )}
        // Slate rather than a brand colour while open: the close button is the
        // one thing in the cluster that must not read as another option.
        style={open ? { background: 'linear-gradient(150deg, #64748b, #475569)' } : undefined}
      >
        {open ? (
          <X size={px(27)} />
        ) : (
          <>
            <img
              src="/ktip-logo.webp"
              alt=""
              className="w-[3.4em] h-[3.4em] object-contain"
            />
            {hasUnseen && (
              <span className="absolute top-[0.625em] right-[0.625em] w-[0.625em] h-[0.625em] rounded-full bg-red-500 animate-pulse-soft" />
            )}
          </>
        )}
      </button>
    </div>

    {/* Outside the cluster: both portal themselves and must not inherit the
        FAB's em basis, which would scale everything inside them. */}
    {feedbackOpen && (
      <Suspense fallback={null}>
        <FeedbackModal open onClose={() => setFeedbackOpen(false)} />
      </Suspense>
    )}
    {fabPanelOpen && (
      <Suspense fallback={null}>
        <StickyNoteFabPanel />
      </Suspense>
    )}
    </>
  )
}
