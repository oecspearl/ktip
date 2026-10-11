import { useEffect, useId, useRef, type ReactNode } from 'react'
import { AccessibilityControls, resetAllSettings, type ControlId } from './AccessibilityControls'
import { useA11yContext } from './context'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex="0"]'

export interface AccessibilityPanelProps {
  onClose: () => void
  /** Buttons beside "Reset all", e.g. "Run setup again" or a settings link */
  actions?: ReactNode
  exclude?: ControlId[]
  className?: string
}

/**
 * The controls in a popover-sized frame: title, close, scrolling body, footer.
 * The host positions it. Non-modal: the page stays usable behind it, so a
 * reader can watch a change land on the real page while they make it.
 *
 * Focus moves to the first control on open and goes back where it came from
 * on close. Escape closes.
 */
export function AccessibilityPanel({ onClose, actions, exclude, className }: AccessibilityPanelProps) {
  const { store, messages: m } = useA11yContext()
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>(`.ak-panel-body ${FOCUSABLE}`)?.focus()
    return () => {
      // Only if focus is still ours: a click elsewhere already chose a target
      if (ref.current?.contains(document.activeElement) || document.activeElement === document.body) {
        previous?.focus?.()
      }
    }
  }, [])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={['ak-panel', className].filter(Boolean).join(' ')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="ak-panel-head">
        <h2 className="ak-panel-title" id={titleId}>
          {m.panelTitle}
        </h2>
        <button type="button" className="ak-icon-btn" aria-label={m.close} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="ak-panel-body">
        <AccessibilityControls variant="panel" exclude={exclude} />
      </div>
      <div className="ak-panel-foot">
        <button type="button" className="ak-btn" onClick={() => resetAllSettings(store)}>
          {m.resetAll}
        </button>
        {actions}
      </div>
    </div>
  )
}
