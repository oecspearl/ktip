import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'
import { TEXTAREA_SURFACE_CLASSES } from '../ui/Textarea'
import { INPUT_SURFACE_CLASSES } from '../ui/Input'
import { buildSegments } from './segments'
import { FlaggedTermList } from './FlaggedTermList'
import type { FieldModeration } from '../../hooks/useContentModeration'
import type { MergedRange } from '../../lib/moderation/scan'

/**
 * A field that draws a red strike through the parts of its own value the
 * content filter objects to.
 *
 * A <textarea> cannot style a substring, so the marks are painted by a mirror
 * copy of the text sitting behind a transparent-background field. The mirror
 * and the field consume the same exported class string, which is what keeps
 * them aligned; everything else in this file is the consequences of that
 * choice — scroll sync, the caret-driven hit test, and the dev-mode drift
 * warning that fires when the two stop agreeing.
 */

/** Any disagreement here misplaces every mark, worse the further down the text. */
const MIRRORED_PROPERTIES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'word-spacing',
  'line-height',
  'text-transform',
  'text-indent',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-left-width',
  'white-space',
  'overflow-wrap',
  'tab-size',
  'direction',
  'text-align',
]

const MARK_CLASSES: Record<string, string> = {
  low: 'bg-red-50 rounded-[2px]',
  medium: 'bg-red-100 rounded-[2px]',
  high: 'bg-red-100 rounded-[2px]',
}

// line-through in every severity, per the brief: the point of the mark is that
// the member can see the text is struck out, not that they can grade it.
const MARK_LINE =
  'underline [text-decoration-line:line-through] decoration-2 decoration-red-500/80'

interface PopoverState {
  range: MergedRange
  text: string
  rect: DOMRect
}

interface SharedProps {
  label?: string
  error?: string
  helperText?: string
  fullWidth?: boolean
  value: string
  moderation?: FieldModeration
}

type ModeratedTextareaProps = SharedProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'>

type ModeratedInputProps = SharedProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'value'>

export function ModeratedTextarea(props: ModeratedTextareaProps) {
  return <ModeratedField {...props} multiline />
}

export function ModeratedInput(props: ModeratedInputProps) {
  return <ModeratedField {...(props as ModeratedTextareaProps)} />
}

function ModeratedField({
  label,
  error,
  helperText,
  fullWidth,
  value,
  moderation,
  className,
  id,
  multiline,
  onCompositionStart,
  onCompositionEnd,
  onScroll,
  onClick,
  onKeyUp,
  onFocus,
  onBlur,
  ...others
}: ModeratedTextareaProps & { multiline?: boolean }) {
  const { t } = useLingui()
  const generatedId = useId()
  const fieldId = id || generatedId
  const termsId = `${fieldId}-flagged`

  const fieldRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)

  const [focused, setFocused] = useState(false)
  // Android and CJK keyboards fire onChange on partial syllables; marking a
  // half-composed word flashes strikethrough at someone mid-sentence.
  const [composing, setComposing] = useState(false)
  const [popover, setPopover] = useState<PopoverState | null>(null)

  const ranges = composing ? [] : (moderation?.overlay.ranges ?? [])
  const active = ranges.length > 0
  const blocked = moderation?.blocked ?? false

  const surface = multiline ? TEXTAREA_SURFACE_CLASSES : INPUT_SURFACE_CLASSES

  const syncScroll = useCallback(() => {
    const field = fieldRef.current
    const mirror = mirrorRef.current
    if (!field || !mirror) return
    // Assigned straight to the node: routing this through state would queue a
    // React render per scroll frame.
    mirror.scrollTop = field.scrollTop
    mirror.scrollLeft = field.scrollLeft
  }, [])

  useLayoutEffect(syncScroll, [value, ranges, syncScroll])

  useEffect(() => {
    if (!active) return
    const field = fieldRef.current
    if (!field || typeof ResizeObserver === 'undefined') return
    // A width change rewraps every line, so the mirror has to re-sync even
    // though the text did not move.
    const observer = new ResizeObserver(syncScroll)
    observer.observe(field)
    return () => observer.disconnect()
  }, [active, syncScroll])

  useEffect(() => {
    if (!import.meta.env.DEV || !active) return
    const field = fieldRef.current
    const mirror = mirrorRef.current
    if (!field || !mirror) return
    const a = getComputedStyle(field)
    const b = getComputedStyle(mirror)
    for (const prop of MIRRORED_PROPERTIES) {
      if (a.getPropertyValue(prop) !== b.getPropertyValue(prop)) {
        console.warn(
          `[moderation] mirror drift on ${prop}: field "${a.getPropertyValue(prop)}" vs mirror "${b.getPropertyValue(prop)}"`
        )
      }
    }
  }, [active, value])

  // Close the popover on any outside press.
  useEffect(() => {
    if (!popover) return
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-moderation-popover]')) return
      setPopover(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [popover])

  /**
   * Hit-testing runs off the caret, not off the marks.
   *
   * The marks sit BEHIND the field, so they can never receive a click, and a
   * transparent hit layer in front would swallow text selection over exactly
   * the words the member is trying to edit. Reading selectionStart costs
   * nothing and works with the mouse, the arrow keys and touch alike.
   */
  const hitTest = useCallback(() => {
    const field = fieldRef.current
    if (!field || !active) return
    const caret = field.selectionStart ?? -1
    const hit = ranges.find((r) => caret >= r.start && caret <= r.end)
    if (!hit) {
      setPopover(null)
      return
    }
    const mark = mirrorRef.current?.querySelector<HTMLElement>(
      `[data-range="${hit.start}-${hit.end}"]`
    )
    const rect = mark?.getBoundingClientRect() ?? field.getBoundingClientRect()
    setPopover({ range: hit, text: value.slice(hit.start, hit.end), rect })
  }, [active, ranges, value])

  const removeRange = useCallback(
    (range: MergedRange) => {
      moderation?.overlay.onRemoveRange(range)
      setPopover(null)
      requestAnimationFrame(() => {
        fieldRef.current?.focus()
        fieldRef.current?.setSelectionRange?.(range.start, range.start)
      })
    },
    [moderation]
  )

  const fieldClasses = cn(
    surface,
    'transition-all focus:outline-none focus:ring-2',
    active ? 'bg-transparent' : 'bg-ktip-sand-50/50 focus:bg-ktip-cream',
    error || blocked
      ? 'border-red-400/70 focus:border-red-400 focus:ring-red-400/15'
      : 'border-ktip-sand-200 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20',
    className
  )

  const commonProps = {
    id: fieldId,
    ref: fieldRef as never,
    value,
    className: cn(fieldClasses, active && 'relative'),
    'aria-invalid': blocked || Boolean(error) || undefined,
    'aria-describedby': moderation && moderation.flaggedTerms.length > 0 ? termsId : undefined,
    onScroll: (e: never) => {
      syncScroll()
      onScroll?.(e)
    },
    onClick: (e: never) => {
      hitTest()
      onClick?.(e)
    },
    onKeyUp: (e: never) => {
      hitTest()
      onKeyUp?.(e)
    },
    onFocus: (e: never) => {
      setFocused(true)
      onFocus?.(e)
    },
    onBlur: (e: never) => {
      setFocused(false)
      onBlur?.(e)
    },
    onCompositionStart: (e: never) => {
      setComposing(true)
      onCompositionStart?.(e)
    },
    onCompositionEnd: (e: never) => {
      setComposing(false)
      onCompositionEnd?.(e)
    },
    ...others,
  }

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
      {label && (
        <label htmlFor={fieldId} className="text-label font-medium text-ktip-sand-700">
          {label}
        </label>
      )}

      <div className="relative">
        {active && (
          <div
            ref={mirrorRef}
            aria-hidden
            className={cn(
              surface,
              'absolute inset-0 overflow-hidden pointer-events-none text-transparent border-transparent',
              // The field is transparent while the overlay is up, so the
              // mirror carries the field's own background — including the
              // focus tint, which would otherwise be lost.
              focused ? 'bg-ktip-cream' : 'bg-ktip-sand-50/50'
            )}
          >
            {buildSegments(value, ranges).map((segment, i) =>
              segment.range ? (
                <mark
                  key={i}
                  data-range={`${segment.range.start}-${segment.range.end}`}
                  className={cn(
                    'text-transparent',
                    MARK_LINE,
                    MARK_CLASSES[segment.range.severity] ?? MARK_CLASSES.medium
                  )}
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={i}>{segment.text}</span>
              )
            )}
            {/* A value ending in a newline otherwise gives the mirror no final
                line box, and the last mark drifts up by one line. */}
            {'\n'}
          </div>
        )}

        {/* One prop bag, two elements. The handlers are identical and the
            element types are not, so the narrowing happens here rather than
            duplicating twenty props per branch. */}
        {multiline ? (
          <textarea {...(commonProps as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
        ) : (
          <input {...(commonProps as unknown as InputHTMLAttributes<HTMLInputElement>)} />
        )}
      </div>

      {moderation && moderation.flaggedTerms.length > 0 && (
        <FlaggedTermList
          id={termsId}
          terms={moderation.flaggedTerms}
          ranges={moderation.overlay.ranges}
          value={value}
          onRemove={removeRange}
        />
      )}

      {(error || helperText) && (
        <p className={cn('text-caption', error ? 'text-red-500' : 'text-ktip-sand-500')}>
          {error || helperText}
        </p>
      )}

      {popover &&
        createPortal(
          <div
            data-moderation-popover
            role="dialog"
            aria-label={t`Flagged text`}
            className="fixed z-max max-w-xs rounded-xl border border-red-200 bg-ktip-cream px-3 py-2 shadow-hard"
            style={{ top: popover.rect.bottom + 6, left: popover.rect.left }}
          >
            <p className="text-xs text-ktip-sand-700">
              <span className="line-through decoration-red-500">{popover.text}</span>
            </p>
            <button
              type="button"
              onClick={() => removeRange(popover.range)}
              className="mt-1.5 text-xs font-medium text-red-600 hover:text-red-700"
            >
              {t`Remove`}
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}
