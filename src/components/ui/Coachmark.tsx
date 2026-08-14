import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  computeAnchorPlacement,
  useMeasuredSize,
  useSpotlightAnchor,
  type AnchorPlacement,
} from './useSpotlightAnchor'
import { useLingui } from '@lingui/react/macro'

export interface CoachmarkProps {
  /** CSS selector for the element being pointed at, e.g. `[data-tutorial="x"]` */
  target: string
  /** A second cutout, e.g. a section plus the toolbar that drives it */
  secondaryTarget?: string
  /** False unmounts nothing but parks the tracking loop and hides the layer */
  open?: boolean
  /** Card heading. Already translated by the caller. */
  title?: ReactNode
  /** Body copy. `whitespace-pre-line`, so `\n` in a string is a line break. */
  description?: ReactNode
  /** Anything below the copy — progress dots, Back/Next, a checklist */
  footer?: ReactNode
  /** Extra controls beside the close button (read-aloud, "don't show again") */
  headerActions?: ReactNode
  /** Full control of the card body instead of title/description/footer */
  children?: ReactNode

  /** Preferred side. The card falls back to whichever side actually fits. */
  position?: AnchorPlacement
  /** Breathing room between the cutout and the target's own edge */
  padding?: number
  /** Distance between the target and the card */
  gap?: number
  /** Keep-off-the-edge margin for the card */
  margin?: number
  /** Dim over everything but the cutout. 0 draws the ring with no scrim. */
  scrimOpacity?: number
  /** Bring the target into view when it changes */
  scrollMode?: 'top' | 'center' | 'none'

  /** Pulses the ring: the tour is waiting on the user to do something */
  awaitingAction?: boolean
  /** Bouncing pill over the target, e.g. "Click to open" */
  hint?: ReactNode
  /** Put the hint over the secondary cutout — the thing actually clickable */
  hintOnSecondary?: boolean
  /**
   * Cover the target with a transparent catcher that re-dispatches the click on
   * the real node. For a spotlit control the user is meant to press once; leave
   * it off when the target is a wrapper whose inner control must be hit itself.
   */
  relay?: boolean
  onRelayClick?: (element: HTMLElement | null) => void

  /** Renders the ✕ in the header. Omit and no close button is drawn. */
  onClose?: () => void
  /** Target still missing after ~1.5s — usually "skip this step" */
  onStranded?: () => void
  /** Names the dialog for screen readers */
  ariaLabel?: string
  className?: string
}

/**
 * A tooltip pinned to any element on the page, over a spotlight cutout.
 *
 * The generic half of a guided tour: it follows a selector, dims everything
 * else, rings the target and places a card beside it on whichever side fits.
 * It holds no step state — a tour drives it by changing `target` and rendering
 * its own controls into `footer`; a one-off "here's the new thing" hint renders
 * a single instance with a dismiss button and nothing else.
 *
 * The layer is `pointer-events-none` apart from the card, the relay and the
 * close button, so the page underneath stays usable while it is up.
 */
export function Coachmark({
  target,
  secondaryTarget,
  open = true,
  title,
  description,
  footer,
  headerActions,
  children,
  position,
  padding = 12,
  gap = 24,
  margin = 20,
  scrimOpacity = 0.82,
  scrollMode = 'center',
  awaitingAction = false,
  hint,
  hintOnSecondary = false,
  relay = false,
  onRelayClick,
  onClose,
  onStranded,
  ariaLabel,
  className,
}: CoachmarkProps) {
  const { t } = useLingui()
  const cardRef = useRef<HTMLDivElement>(null)
  // Unique per instance: two coachmarks on screen would otherwise share one
  // SVG mask, and the second would cut its hole out of the first's scrim.
  const maskId = useId().replace(/:/g, '')

  const anchor = useSpotlightAnchor({
    target,
    secondaryTarget,
    active: open,
    scrollMode,
    onStranded,
  })

  // Remeasured per target: a card that grew between steps would otherwise be
  // placed against the previous step's height.
  const cardSize = useMeasuredSize(cardRef, [target, open])
  const placement = computeAnchorPlacement(anchor.box, cardSize.width, cardSize.height, {
    gap,
    margin,
    preferred: position,
  })

  if (!open) return null

  // A centred card still gets its cutout — `position` controls the card only
  const spotlit = anchor.box !== null
  const hintBox = hintOnSecondary ? anchor.secondaryBox ?? anchor.box : anchor.box

  return createPortal(
    <div
      data-coachmark
      className={cn(
        'fixed inset-0 z-tutorial isolation-isolate pointer-events-none animate-fade-in',
        className
      )}
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel ?? t`Guided tour`}
    >
      {scrimOpacity > 0 && (
        <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {spotlit &&
                anchor.boxes.map((box, i) => (
                  <rect
                    key={i}
                    x={box.left - padding}
                    y={box.top - padding}
                    width={box.width + padding * 2}
                    height={box.height + padding * 2}
                    rx={10}
                    fill="black"
                  />
                ))}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`rgba(0,0,0,${scrimOpacity})`}
            mask={`url(#${maskId})`}
          />
        </svg>
      )}

      {/* Ring(s) around the spotlit element */}
      {spotlit &&
        anchor.boxes.map((box, i) => (
          <div
            key={i}
            className={cn(
              'absolute rounded-lg border-2 border-ktip-ocean-500 pointer-events-none',
              awaitingAction && 'animate-pulse'
            )}
            style={{
              top: box.top - padding,
              left: box.left - padding,
              width: box.width + padding * 2,
              height: box.height + padding * 2,
            }}
          />
        ))}

      {/* Click relay — catches the click and re-dispatches it on the real node,
          which is what lets a step be "click this" without the scrim eating it */}
      {relay && anchor.box && (
        <div
          className="absolute z-10 cursor-pointer pointer-events-auto"
          onClick={() => {
            anchor.element?.dispatchEvent(
              new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
            )
            onRelayClick?.(anchor.element)
          }}
          style={{
            top: anchor.box.top - padding,
            left: anchor.box.left - padding,
            width: anchor.box.width + padding * 2,
            height: anchor.box.height + padding * 2,
          }}
        />
      )}

      {hint && hintBox && (
        <div
          className="absolute z-20 -translate-x-1/2 animate-bounce pointer-events-none"
          style={{ top: hintBox.top - padding - 40, left: hintBox.left + hintBox.width / 2 }}
        >
          <span className="inline-block whitespace-nowrap rounded-full bg-ktip-ocean-600 dark:bg-ktip-ocean-200 px-3 py-1.5 text-xs font-bold text-white shadow-hard">
            {hint}
          </span>
        </div>
      )}

      <div
        ref={cardRef}
        className="absolute z-30 pointer-events-auto w-[calc(100vw-2.5rem)] max-w-md max-h-[80vh] overflow-y-auto bg-ktip-cream rounded-2xl border border-ktip-line shadow-hard p-5 animate-scale-in"
        style={{ top: placement.top, left: placement.left }}
      >
        {(title || headerActions || onClose) && (
          <div className="flex items-start justify-between gap-3">
            {title ? (
              <h2 className="font-display font-bold text-lg text-ktip-sand-900 leading-snug">
                {title}
              </h2>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-1 shrink-0">
              {headerActions}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t`Close tour`}
                  className="p-1.5 rounded-lg text-ktip-sand-500 hover:bg-ktip-sand-100 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        )}

        {description && (
          <p className="mt-2 text-sm text-ktip-sand-600 leading-relaxed whitespace-pre-line">
            {description}
          </p>
        )}

        {children}

        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}