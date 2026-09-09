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

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
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
      className={cn(
        'fixed inset-0 z-modal flex items-center justify-center animate-fade-in',
        scrim === 'sheer' ? 'bg-black/20' : 'bg-black/50 backdrop-blur-sm'
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
          'relative w-full mx-4 animate-scale-in max-h-[90vh]',
          // Bare keeps overflow visible on purpose: its content brings its own
          // frame and may deliberately extend past it.
          bare
            ? 'overflow-visible'
            // neu-surface: buttons in the dialog sculpt out of the dialog fill,
            // not out of the page ground behind the scrim. See index.css.
            : 'neu-surface bg-ktip-cream rounded-surface-lg shadow-hard overflow-y-auto',
          sizeStyles[size || 'md'],
          className
        )}
        {...others}
      >
        {!bare && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between p-card-pad border-b border-ktip-sand-100">
              <div className="flex-1">
                {title && (
                  <h2 className="text-title font-display font-bold text-ktip-sand-900">{title}</h2>
                )}
                {description && <p className="mt-1 text-caption text-ktip-sand-600">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="ml-4 p-1 rounded-control hover:bg-ktip-sand-100 transition-colors"
                aria-label={t`Close modal`}
              >
                <X size={24} className="text-ktip-sand-400" />
              </button>
            </div>
          </>
        )}

        {/* Content */}
        <div className={bare ? undefined : 'p-card-pad'}>{children}</div>
      </div>
    </div>,
    document.body
  )
}
