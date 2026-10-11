import { useId, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import type { A11yMessages } from './messages'

/**
 * The kit's form controls. Unstyled beyond the `ak-` classes in css/ui.css,
 * dependency-free, and built on the native semantics a screen reader already
 * understands: role=switch, a labelled group of two buttons, a radiogroup with
 * arrow-key movement.
 */

interface RowProps {
  label: string
  hint?: string
  disabled?: boolean
}

export function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: RowProps & { checked: boolean; onChange: (next: boolean) => void }) {
  const id = useId()
  return (
    <div className="ak-row" data-disabled={disabled || undefined}>
      <div className="ak-row-text">
        <span className="ak-row-label" id={`${id}-l`}>
          {label}
        </span>
        {hint && (
          <span className="ak-hint" id={`${id}-h`}>
            {hint}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        className="ak-switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={hint ? `${id}-h` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  )
}

export function StepperRow({
  label,
  hint,
  value,
  display,
  min,
  max,
  disabled,
  messages,
  onStep,
}: RowProps & {
  value: number
  display: string
  min: number
  max: number
  messages: A11yMessages
  /** One step down or up. The caller reads the live value, so rapid presses all count */
  onStep: (direction: 1 | -1) => void
}) {
  const id = useId()
  return (
    <div className="ak-row" data-disabled={disabled || undefined}>
      <div className="ak-row-text">
        <span className="ak-row-label" id={`${id}-l`}>
          {label}
        </span>
        {hint && <span className="ak-hint">{hint}</span>}
      </div>
      <div className="ak-stepper" role="group" aria-labelledby={`${id}-l`}>
        <button
          type="button"
          aria-label={messages.decrease(label)}
          disabled={disabled || value <= min}
          onClick={() => onStep(-1)}
        >
          <span aria-hidden="true">−</span>
        </button>
        {/* Announced on change: the buttons keep focus, so without this a
            screen reader hears nothing when the value moves */}
        <output aria-live="polite">{display}</output>
        <button
          type="button"
          aria-label={messages.increase(label)}
          disabled={disabled || value >= max}
          onClick={() => onStep(1)}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  )
}

export interface ChoiceOption<T extends string | number> {
  value: T
  label: string
  /** Rendered in its own language or typeface, e.g. a font previewing itself */
  lang?: string
  style?: CSSProperties
}

export function ChoiceRow<T extends string | number>({
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: RowProps & { value: T; options: ChoiceOption<T>[]; onChange: (next: T) => void }) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  )

  // Radiogroup keyboard model: one tab stop, arrows move and select
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    let next: number | null = null
    if (e.key in keys) next = (current + keys[e.key] + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    if (next === null) return
    e.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div className="ak-row ak-row-stack" data-disabled={disabled || undefined}>
      <div className="ak-row-text">
        <span className="ak-row-label" id={`${id}-l`}>
          {label}
        </span>
        {hint && (
          <span className="ak-hint" id={`${id}-h`}>
            {hint}
          </span>
        )}
      </div>
      <div
        className="ak-choice"
        role="radiogroup"
        aria-labelledby={`${id}-l`}
        aria-describedby={hint ? `${id}-h` : undefined}
        aria-disabled={disabled || undefined}
        onKeyDown={disabled ? undefined : onKeyDown}
      >
        {options.map((o, i) => (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={i === current}
            tabIndex={i === current ? 0 : -1}
            disabled={disabled}
            lang={o.lang}
            style={o.style}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Section({
  title,
  resetLabel,
  resetText,
  canReset,
  onReset,
  children,
}: {
  title: string
  resetLabel: string
  resetText: string
  canReset: boolean
  onReset: () => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className="ak-section" aria-labelledby={id}>
      <div className="ak-section-head">
        <h3 className="ak-section-title" id={id}>
          {title}
        </h3>
        <button type="button" className="ak-link-btn" aria-label={resetLabel} disabled={!canReset} onClick={onReset}>
          {resetText}
        </button>
      </div>
      <div className="ak-section-body">{children}</div>
    </section>
  )
}
