import { useLingui } from '@lingui/react/macro'
import { ALL_COUNTRIES, COUNTRY_GROUPS } from '../../lib/countries'
import { cn } from '../../lib/utils'

interface CountrySelectProps {
  value: string
  onChange: (value: string) => void
  /**
   * `form` is the labelled field used in the signup, onboarding and settings
   * forms; `filter` is the bare control used in the directory filter bar.
   */
  variant?: 'form' | 'filter'
  /** Form variant only. Defaults to "Country". */
  label?: string
  /** Text of the empty option. Defaults per variant. */
  placeholder?: string
  id?: string
  name?: string
  required?: boolean
  className?: string
}

const FORM_CLASSES =
  'w-full border border-ktip-sand-200 rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-ktip-cream'

const FILTER_CLASSES =
  'px-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm'

/**
 * The one country control, used everywhere a member says where they are.
 *
 * A native `<select>` with `<optgroup>`, deliberately: two hundred options is
 * exactly the case the platform's own Select doc reserves for the native
 * control, which brings its own scrolling, type-ahead and mobile picker for
 * free. See src/components/ui/Select.tsx.
 *
 * A stored value that is no longer offered is appended as its own option
 * rather than silently reset — a profile saved with an older list would
 * otherwise show "Select a country" and quietly lose the answer on the next
 * save.
 */
export function CountrySelect({
  value,
  onChange,
  variant = 'form',
  label,
  placeholder,
  id,
  name,
  required,
  className,
}: CountrySelectProps) {
  const { t, i18n } = useLingui()

  const empty = placeholder ?? (variant === 'filter' ? t`All Countries` : t`Select a country`)
  const unlisted = value !== '' && !ALL_COUNTRIES.includes(value)

  const select = (
    <select
      id={id}
      name={name}
      required={required}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      className={cn(variant === 'filter' ? FILTER_CLASSES : FORM_CLASSES, className)}
    >
      <option value="">{empty}</option>
      {unlisted && <option value={value}>{value}</option>}
      {COUNTRY_GROUPS.map((group) => (
        <optgroup key={group.label.id ?? String(group.label)} label={i18n._(group.label)}>
          {group.countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )

  if (variant === 'filter') return select

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label htmlFor={id} className="text-sm font-medium text-ktip-sand-700">
        {label ?? t`Country`}
      </label>
      {select}
    </div>
  )
}
