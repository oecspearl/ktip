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
import { useBackdropTone } from '../../hooks/useBackdropTone'
import {
  A11Y_DEFAULTS,
  A11Y_RANGE,
  useAccessibilityPrefs,
} from '../../hooks/useAccessibilityPrefs'
import { useViewportScale } from '../../hooks/useViewportScale'
import { cn } from '../../lib/utils'
import { useDisclosureAnimation } from './useDisclosureAnimation'
import { Trans, useLingui } from '@lingui/react/macro'

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
  const { t } = useLingui()
  const button =
    'w-[1.75em] h-[1.75em] rounded-[0.375em] flex items-center justify-center border border-ktip-sand-200 text-ktip-sand-700 hover:bg-ktip-sand-50 hover:text-ktip-ocean-600 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ktip-sand-700 transition-colors'

  return (
    <div className="mt-[0.75em] first:mt-0">
      <div className="flex items-center gap-[0.375em] text-[0.75em] text-ktip-sand-600 mb-[0.375em]">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-[0.5em]">
        <button onClick={onDecrease} disabled={atMin} aria-label={t`Decrease ${label}`} className={button}>
          <Minus size={iconSize} />
        </button>
        {/* tabular-nums so the row does not reflow as the number changes */}
        <span className="flex-1 text-center text-[0.8125em] font-medium tabular-nums text-ktip-sand-900">
          {value}
        </span>
        <button onClick={onIncrease} disabled={atMax} aria-label={t`Increase ${label}`} className={button}>
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
  const { t } = useLingui()
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  // The trigger is a pale tile that vanishes on the app's white pages and a
  // white blob on the dark venue/hero bands. Read what is actually underneath
  // and flip to brand yellow over light surfaces. Only while collapsed —
  // expanded, the trigger is the slate close button and owns its own colour.
  const backdrop = useBackdropTone(triggerRef, !open, pathname)
  const onLightBackdrop = backdrop === 'light'
  // Kept mounted through its exit so the panel can fall back into the cluster;
  // timings must match .fab-panel in index.css.
  const a11yPanel = useDisclosureAnimation(open && a11yOpen, { enterMs: 220, exitMs: 180 })
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
      label: t`Sticky notes`,
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
      label: t`Accessibility`,
      icon: <Accessibility size={px(23)} />,
      tone: 'blue',
      // Opens a panel rather than acting directly, so the cluster stays open
      onClick: () => setA11yOpen((v) => !v),
    },
    {
      id: 'feedback',
      label: t`Feedback`,
      icon: <Megaphone size={px(23)} />,
      tone: 'red',
      onClick: () => {
        setFeedbackOpen(true)
        setOpen(false)
      },
    },
    {
      id: 'tutorial',
      label: t`Page tour`,
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
      label: t`Messages`,
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
      label: dark ? t`Light mode` : t`Dark mode`,
      icon: dark ? <Sun size={px(23)} /> : <Moon size={px(23)} />,
      tone: 'amber',
      // Stays open so the flip is visible
      onClick: () => setDark(!dark),
    },
  ]

  const visible = actions.filter((a) => a.show !== false)
  // Only unread messages raise the dot on the collapsed trigger. Sticky notes
  // you left yourself and a page tour you haven't taken are not news; someone
  // waiting on a reply is. Any badge at all lighting the trigger meant it was
  // lit almost permanently, which is the same as not being lit at all.
  const hasUnread = unreadCount > 0

  // How long the fall actually takes: the last button's stagger delay plus its
  // own transform. Must track the transitionDelay/transition on the sub-buttons.
  const collapseMs = Math.max(visible.length - 1, 0) * 50 + 340

  // The trigger is the lid of the cluster: it holds the X — and the slate fill
  // — until the last button has landed, then turns back into the logo. Letting
  // it flip the instant `open` goes false put the logo back on screen while six
  // buttons were still visibly falling past it.
  const [collapsing, setCollapsing] = useState(false)
  const wasOpen = useRef(open)
  useEffect(() => {
    const closing = wasOpen.current && !open
    wasOpen.current = open
    if (!closing) {
      if (open) setCollapsing(false)
      return
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    setCollapsing(true)
    const t = setTimeout(() => setCollapsing(false), collapseMs)
    return () => clearTimeout(t)
  }, [open, collapseMs])

  const showClose = open || collapsing

  const atDefaults =
    a11y.fontScale === A11Y_DEFAULTS.fontScale && a11y.brightness === A11Y_DEFAULTS.brightness

  return (
    <>
    <div
      ref={containerRef}
      data-fab
      className="fixed bottom-[1.5em] right-[1.5em] z-fab flex flex-col items-center gap-[0.75em]"
      style={{ fontSize: `${16 * scale}px` }}
    >
      {/* Accessibility panel — anchored above the cluster, inside containerRef
          so the outside-click handler treats it as part of the FAB */}
      {a11yPanel.mounted && (
        <div
          role="group"
          aria-label={t`Accessibility settings`}
          data-state={a11yPanel.state}
          className="fab-panel origin-bottom-right absolute bottom-full right-0 mb-[0.75em] w-[15em] rounded-[0.75em] border border-ktip-sand-200 bg-ktip-cream p-[1em] shadow-fab-hover"
        >
          <div className="flex items-center justify-between mb-[0.75em]">
            <p className="text-[0.8125em] font-semibold text-ktip-sand-900"><Trans>Accessibility</Trans></p>
            <button
              onClick={() => setA11y(A11Y_DEFAULTS)}
              disabled={atDefaults}
              className="flex items-center gap-[0.25em] text-[0.6875em] text-ktip-sand-500 hover:text-ktip-ocean-600 disabled:opacity-40 disabled:hover:text-ktip-sand-500 transition-colors"
            >
              <RotateCcw size={px(11)} />
              <Trans>Reset</Trans>
            </button>
          </div>

          <NumberStepper
            icon={<Type size={px(14)} />}
            label={t`Text size`}
            value={`${Math.round(a11y.fontScale * 100)}%`}
            onDecrease={() => setA11y({ fontScale: a11y.fontScale - A11Y_RANGE.fontScale.step })}
            onIncrease={() => setA11y({ fontScale: a11y.fontScale + A11Y_RANGE.fontScale.step })}
            atMin={a11y.fontScale <= A11Y_RANGE.fontScale.min}
            atMax={a11y.fontScale >= A11Y_RANGE.fontScale.max}
            iconSize={px(13)}
          />

          <NumberStepper
            icon={<SunMedium size={px(14)} />}
            label={t`Photo brightness`}
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
            open ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 pointer-events-none'
          )}
          style={{
            background: fill(action.tone),
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
            // all six blinking out at once.
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
          <span className="absolute right-full mr-[0.75em] top-1/2 -translate-y-1/2 whitespace-nowrap px-[0.833em] py-[0.5em] rounded-[0.667em] bg-ktip-ink text-white text-[0.75em] font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
            {action.label}
          </span>
        </button>
      ))}

      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-label={t`Quick actions`}
        aria-expanded={open}
        className={cn(
          // No overflow-hidden here: the unread badge overhangs the corner.
          // The fill layers carry their own radius instead.
          'relative w-[4.5em] h-[4.5em] rounded-[1.375em] flex items-center justify-center shadow-fab border',
          'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          showClose
            ? 'text-white shadow-fab-hover'
            : 'hover:scale-105 hover:-translate-y-0.5 hover:shadow-fab-hover'
        )}
        // `border` is on in BOTH states — toggling the class changed the
        // content box by 1px mid-transition and made the logo twitch.
        style={{
          borderColor: showClose
            ? 'rgba(71, 85, 105, 0.9)'
            : onLightBackdrop
              ? 'rgba(179, 133, 0, 0.4)'
              : 'rgba(231, 229, 228, 0.9)',
        }}
      >
        {/* Two background layers cross-fading, not one `background` swapped in
            place: a gradient is not an interpolatable value, so assigning the
            slate fill switched the tile instantly while the icons were still
            mid-turn — that was the flash on click.

            Literal hex, like TONES above: the tile is picked from the backdrop,
            not the theme, so it must not ride a palette that inverts at dusk. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-[1.375em] transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            // The pale end of the brand yellow ramp (sun-100 → sun-200), not
            // Pantone 123 itself: full-strength 123 next to the logo's own
            // saturated green fought it for attention.
            background: onLightBackdrop
              ? 'linear-gradient(150deg, #FFF1C4, #FFE48A)'
              : '#FFFEF9',
            opacity: showClose ? 0 : 1,
          }}
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-[1.375em] transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          // Slate rather than a brand colour while open: the close button is
          // the one thing in the cluster that must not read as another option.
          style={{
            background: 'linear-gradient(150deg, #64748b, #475569)',
            opacity: showClose ? 1 : 0,
          }}
        />

        {/* Both faces stay mounted and cross-turn into each other. Swapping the
            node outright made the handover a hard cut in the middle of an
            otherwise eased sequence. */}
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
            showClose ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75'
          )}
        >
          <X size={px(27)} />
        </span>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
            showClose ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'
          )}
        >
          <img src="/ktip-logo-128.webp" alt="" className="w-[3.4em] h-[3.4em] object-contain" />
        </span>
        {hasUnread && !showClose && (
          // Same box as the sub-buttons' badge, scaled to this larger tile —
          // the corner it sits in should not move as the cluster opens.
          <span className="absolute -top-[0.25em] -right-[0.25em] w-[1.5em] h-[1.5em] rounded-full bg-red-500 shadow-sm ring-2 ring-white/90 animate-pulse-soft" />
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
