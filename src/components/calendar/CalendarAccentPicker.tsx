import { cn } from '../../lib/utils'
import {
  CALENDAR_ACCENTS,
  CALENDAR_ACCENT_DOT_COLORS,
  CALENDAR_ACCENT_LABELS,
  type CalendarAccent,
} from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import { useLingui } from '@lingui/react/macro'

interface CalendarAccentPickerProps {
  value: CalendarAccent | null
  onChange: (accent: CalendarAccent | null) => void
  /** Offers a "use the type's colour" swatch — events have a fallback, notes do not */
  allowClear?: boolean
  className?: string
}

/**
 * Colour well for anything that shows up on the calendar. Swatches are the same
 * 3px bar the grid draws, not round chips, so the choice is shown in the shape
 * it will actually take.
 */
export function CalendarAccentPicker({
  value,
  onChange,
  allowClear = false,
  className,
}: CalendarAccentPickerProps) {
  const { t, i18n } = useLingui()

  return (
    <div role="radiogroup" aria-label={t`Calendar colour`} className={cn('flex flex-wrap gap-1.5', className)}>
      {allowClear && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          title={t`Match the event type`}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-neu-sm px-2.5 text-caption font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
            value === null
              ? 'bg-ktip-sand-100 text-ktip-ocean-700 shadow-neu-sm-inset'
              : 'text-ktip-sand-600 hover:text-ktip-ocean-700 hover:shadow-neu-sm'
          )}
        >
          {t`Auto`}
        </button>
      )}

      {CALENDAR_ACCENTS.map((accent) => {
        const label = resolveCopy(i18n, CALENDAR_ACCENT_LABELS[accent])
        const active = value === accent
        return (
          <button
            key={accent}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(accent)}
            title={label}
            aria-label={label}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-neu-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
              active
                ? 'bg-ktip-sand-100 shadow-neu-sm-inset'
                : 'hover:shadow-neu-sm'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'w-[3px] rounded-full transition-all',
                CALENDAR_ACCENT_DOT_COLORS[accent],
                active ? 'h-5' : 'h-4'
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
