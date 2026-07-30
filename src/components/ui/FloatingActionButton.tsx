import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import {
  Accessibility,
  GraduationCap,
  MessageSquare,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Sun,
  SunMedium,
  Type,
  X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useMessagingPanel } from '../../contexts/MessagingPanelContext'
import { useTutorials } from '../../contexts/TutorialContext'
import { tutorialIdForPath } from '../../data/tutorials'
import { useThemeMode } from '../../hooks/useThemeMode'
import {
  A11Y_DEFAULTS,
  A11Y_RANGE,
  useAccessibilityPrefs,
} from '../../hooks/useAccessibilityPrefs'
import { useViewportScale } from '../../hooks/useViewportScale'
import { cn } from '../../lib/utils'

// Authored against the same 2000px-wide reference viewport as the hero. Width
// only — the cluster is corner-anchored, so viewport height doesn't affect it.
// Floor of 0.8 keeps the trigger at 51px, above the 44px minimum touch target.
const FAB_DESIGN = { width: 2000, min: 0.8, max: 1 }

interface FabAction {
  id: string
  label: string
  icon: ReactNode
  onClick: () => void
  show?: boolean
  /** Pulsing dot — "there is something here you haven't done yet" */
  badge?: boolean
}

interface StepperProps {
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

/** One labelled −/value/+ row in the accessibility panel */
function Stepper({
  icon,
  label,
  value,
  onDecrease,
  onIncrease,
  atMin,
  atMax,
  iconSize,
}: StepperProps) {
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
 * Add future actions by appending to the `actions` array below.
 * Note: this corner is also reserved by the (currently unmounted)
 * UATFeedbackButton — reposition one of them before mounting both.
 */
export function FloatingActionButton() {
  const auth = useAuth()
  const { togglePanel } = useMessagingPanel()
  const { startTutorial, isTutorialCompleted } = useTutorials()
  const { pathname } = useLocation()
  const [dark, setDark] = useThemeMode()
  const [a11y, setA11y] = useAccessibilityPrefs()
  const [open, setOpen] = useState(false)
  const [a11yOpen, setA11yOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // Every length below is `em` against this, so the cluster keeps its authored
  // proportions instead of looking oversized on a smaller CSS viewport
  const scale = useViewportScale(FAB_DESIGN)
  const px = (n: number) => Math.round(n * scale)

  // Only pages with a registered walkthrough show the graduation-cap action
  const pageTutorialId = tutorialIdForPath(pathname)

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
      id: 'tutorial',
      label: 'Page tour',
      icon: <GraduationCap size={px(20)} />,
      onClick: () => {
        if (pageTutorialId) startTutorial(pageTutorialId)
        setOpen(false)
      },
      show: !!pageTutorialId,
      badge: !!pageTutorialId && !isTutorialCompleted(pageTutorialId),
    },
    {
      id: 'theme',
      label: dark ? 'Light mode' : 'Dark mode',
      icon: dark ? <Sun size={px(20)} /> : <Moon size={px(20)} />,
      // Stays open so the flip is visible
      onClick: () => setDark(!dark),
    },
    {
      id: 'accessibility',
      label: 'Accessibility',
      icon: <Accessibility size={px(20)} />,
      // Opens a panel rather than acting directly, so the cluster stays open
      onClick: () => setA11yOpen((v) => !v),
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: <MessageSquare size={px(20)} />,
      onClick: () => {
        togglePanel()
        setOpen(false)
      },
      show: !!auth.user,
    },
  ]

  const visible = actions.filter((a) => a.show !== false)
  // Surfaced on the collapsed trigger too — a dot only on the fanned-out
  // sub-button would never be seen by the person who most needs the tour
  const hasUnseen = visible.some((a) => a.badge)

  const atDefaults =
    a11y.fontScale === A11Y_DEFAULTS.fontScale && a11y.brightness === A11Y_DEFAULTS.brightness

  return (
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

          <Stepper
            icon={<Type size={px(14)} />}
            label="Text size"
            value={`${Math.round(a11y.fontScale * 100)}%`}
            onDecrease={() => setA11y({ fontScale: a11y.fontScale - A11Y_RANGE.fontScale.step })}
            onIncrease={() => setA11y({ fontScale: a11y.fontScale + A11Y_RANGE.fontScale.step })}
            atMin={a11y.fontScale <= A11Y_RANGE.fontScale.min}
            atMax={a11y.fontScale >= A11Y_RANGE.fontScale.max}
            iconSize={px(13)}
          />

          <Stepper
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
            'relative group w-[3.5em] h-[3.5em] rounded-[0.75em] flex items-center justify-center',
            'bg-ktip-cream/90 backdrop-blur-md border border-ktip-sand-200 text-ktip-sand-700 shadow-fab',
            'hover:text-ktip-ocean-600 hover:shadow-fab-hover',
            open
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-4 scale-75 pointer-events-none'
          )}
          style={{
            transition:
              'transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease, color 0.2s ease, box-shadow 0.35s cubic-bezier(0.22,1,0.36,1)',
            transitionDelay: open ? `${0.03 + (visible.length - 1 - index) * 0.06}s` : '0s',
          }}
        >
          {action.icon}
          {action.badge && (
            <span className="absolute top-[0.5em] right-[0.5em] w-[0.5em] h-[0.5em] rounded-full bg-red-500 animate-pulse-soft" />
          )}
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
          'relative w-[4em] h-[4em] rounded-[1em] flex items-center justify-center shadow-fab',
          'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          open
            ? 'bg-gray-500 text-white shadow-fab-hover'
            : 'bg-ktip-cream border border-ktip-sand-200 hover:scale-105 hover:-translate-y-0.5 hover:shadow-fab-hover'
        )}
      >
        {open ? (
          <X size={px(24)} />
        ) : (
          <>
            <img
              src="/ktip-logo.webp"
              alt=""
              className="w-[3em] h-[3em] object-contain"
            />
            {hasUnseen && (
              <span className="absolute top-[0.625em] right-[0.625em] w-[0.625em] h-[0.625em] rounded-full bg-red-500 animate-pulse-soft" />
            )}
          </>
        )}
      </button>
    </div>
  )
}
