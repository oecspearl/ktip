import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useLingui } from '@lingui/react/macro'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  /**
   * Drops the cream panel, the header and the content padding, leaving only
   * the backdrop and the dialog semantics — focus trap, escape, scroll lock,
   * restore-focus. For content that IS the dialog and brings its own frame and
   * close control; the trophy detail card is the case this was added for,
   * because its artwork deliberately overflows the card edge and the panel's
   * own `overflow-y-auto` would clip it.
   *
   * `title` is still used for the accessible name even though nothing renders
   * it, so a bare modal is not an unlabelled dialog.
   */
  bare?: boolean
  /**
   * How much of the page behind the dialog it is allowed to keep.
   *
   * `solid` — the default: half black and blurred, so the page reads as put
   *           away and the dialog is the only thing being looked at.
   * `sheer` — a fifth black and no blur, for a dialog whose whole purpose is
   *           to change what is behind it. The profile block editors are the
   *           case: the preview updates as you type, and a half-black blur is
   *           an expensive way to hide the reason the screen exists.
   */
  scrim?: 'solid' | 'sheer'
  className?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, description, children, size, bare, scrim = 'solid', className, ...others }: ModalProps) {
    const { t } = useLingui()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    // 48rem, written out: the ratchet in design/tokens.test.ts counts every
    // `max-w-Nxl` as a legacy page width, and this is a dialog, not a page.
    '2xl': 'max-w-[48rem]',
    // For a dialog that is a workspace rather than a question — a gallery of
    // artwork beside a live preview needs both to be big enough to judge.
    '3xl': 'max-w-[64rem]',
  }

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onClose()
      // React bubbles events through portals along the component tree, so a
      // modal opened from inside another (the video player over a grant
      // application) would otherwise hand this Escape to the outer one too.
      e.stopPropagation()
      return
    }
    if (e.key !== 'Tab' || !dialogRef.current) return

    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Focus management: save previous focus, restore on close
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement
      const raf = requestAnimationFrame(() => {
        if (dialogRef.current) {
          const first = dialogRef.current.querySelector<HTMLElement>(FOCUSABLE)
          first?.focus()
        }
      })
      return () => cancelAnimationFrame(raf)
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [open])

  // Prevent body scroll when modal is open. Restores whatever was there before
  // rather than clearing it: when a modal stacks on another, the inner one
  // closing must leave the outer one's lock in place.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      // Taken off screen while a screenshot frame is grabbed — see the
      // data-capturing rule in index.css. Backdrop included: the dimming and
      // the blur are as much a part of "the app on top of the page" as the
      // dialog is.
      data-capture-hide
      // The blur is the expensive half of the scrim; mobile-lite drops it and
      // keeps a slightly deeper tint in its place (index.css, MOBILE-LITE).
      data-lite-solid={scrim === 'sheer' ? undefined : ''}
      className={cn(
        'fixed inset-0 z-modal flex justify-center animate-fade-in',
        // Below sm a framed dialog is a bottom sheet. Centred, a tall form put
        // its buttons in the lower half of the screen, which is exactly where
        // the keyboard opens. A bare dialog brings its own frame and stays
        // centred at every width.
        bare ? 'items-center' : 'items-end sm:items-center',
        scrim === 'sheer' ? 'bg-black/20' : 'bg-black/50 backdrop-blur-sm [--lite-solid:rgb(0_0_0/0.6)]'
      )}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          // dvh: the visible viewport, so the cap shrinks with the browser's
          // toolbars instead of running underneath them.
          'relative w-full max-h-[90dvh]',
          // Bare keeps overflow visible on purpose: its content brings its own
          // frame and may deliberately extend past it.
          bare
            ? 'mx-4 animate-scale-in overflow-visible'
            // neu-surface: buttons in the dialog sculpt out of the dialog fill,
            // not out of the page ground behind the scrim. See index.css.
            // A column with only the content scrolling, so the title and the
            // close button stay put while a long form moves under them.
            : 'neu-surface bg-ktip-cream shadow-hard flex flex-col overflow-hidden rounded-t-surface-lg animate-sheet-up sm:mx-4 sm:rounded-surface-lg sm:animate-scale-in',
          sizeStyles[size || 'md'],
          // A phone sheet spans the screen edge to edge; a size cap a few
          // pixels under the phone's width would leave slivers either side.
          !bare && 'max-sm:max-w-none',
          className
        )}
        {...others}
      >
        {!bare && (
          <>
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between p-card-pad border-b border-ktip-sand-100">
              <div className="flex-1">
                {title && (
                  <h2 className="text-title font-display font-bold text-ktip-sand-900">{title}</h2>
                )}
                {description && <p className="mt-1 text-caption text-ktip-sand-600">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="icon-hit ml-4 p-1 rounded-control hover:bg-ktip-sand-100 transition-colors"
                aria-label={t`Close modal`}
              >
                <X size={24} className="text-ktip-sand-400" />
              </button>
            </div>
          </>
        )}

        {/* Content. On the phone sheet the last row clears the home indicator,
            which the sheet's bottom edge sits directly on. */}
        <div
          className={
            bare
              ? undefined
              : 'min-h-0 overflow-y-auto overscroll-contain p-card-pad pb-[calc(var(--spacing-card-pad)+env(safe-area-inset-bottom,0px))] sm:pb-card-pad'
          }
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
